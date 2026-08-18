import { useEffect, useMemo, useState } from 'react';
import {
  Plus, Upload, Search, ChevronDown,
  Truck, Wrench, CheckCircle2, Car, CalendarDays, FileText, Fuel, UserRound, ShieldCheck,
  ImagePlus, X, Pencil
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { getBaseUrl } from '@/lib/config';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

// Brand color used throughout Inventory.tsx — matched here for a consistent look
const BRAND = '#0D3A35';

// Some staff records store contract/vendor metadata (e.g. { type, vendor, order_number })
// in fields that are normally plain strings (department, designation, etc.) — this file's
// staff data is fetched as `any`, so nothing catches that at the type level. Rendering such
// an object directly as JSX crashes the whole page, so every display value goes through this.
const safeText = (value: unknown, fallback = '-'): string => {
  if (value == null || value === '') return fallback;
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const parts = [obj.vendor, obj.type, obj.order_number].filter((v) => typeof v === 'string' && v);
    return parts.length ? parts.join(' · ') : fallback;
  }
  return fallback;
};

const Field = ({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) => (
  <div className="flex flex-col gap-1.5">
    <label className="text-xs font-bold text-slate-500">{label}{required && ' *'}</label>
    {children}
  </div>
);

const SelectField = ({
  value, onChange, disabled, placeholder, options,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder: string;
  options: Array<{ value: string; label: string }>;
}) => (
  <div className="relative">
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 pr-8 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100 disabled:text-slate-400"
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
    <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
  </div>
);

// --- TYPES ---
interface Vehicle {
  id: string;
  registrationNo: string;
  ownerType: 'Owned' | 'Hired';
  ownedByRaw: string;
  vehicleType: 'Truck' | 'Tractor' | 'Trolley' | 'Tipper' | 'Pickup' | 'Car' | 'Harvester' | 'JCB' | 'Bike' | 'Other';
  make: string;
  model: string;
  status: 'Active' | 'Under Maintenance' | 'Out of Service' | 'Contract Expired' | 'Sold/Disposed' | 'Inactive';
  lastServiceDate?: string;
  assignedStaff: any[];
  fuelLogs: any[];
  serviceHistory: any[];
  workCalendar: any[];
  photos: string[];
  information: ApiVehicle['vehicle_information'];
}

type ApiVehicle = {
  vehicle_id: string;
  created_at?: string;
  vehicle_information: {
    [key: string]: unknown;
    vehicle_number: string;
    owned_by: string;
    company: string;
    model: string;
    type: string;
    last_service_date: string;
    vehicle_photos?: string[];
    vehicle_photo_urls?: string[];
    vehicle_photo_url?: string;
    photo_url?: string;
    ownership_mode?: 'self_owned' | 'contract';
    work_order_id?: string;
    vendor_id?: string;
    vendor_name?: string;
    insurance_validity?: string;
    permit_validity?: string;
    pollution_cert_validity?: string;
    rc_doc_key?: string;
    servicing_responsibility?: 'vendor' | 'SBR';
    last_service_km?: number;
  };
  assigned_staff: any[] | Record<string, any> | null;
  servise_history: any[];
  fuel_logs: any[];
  work_calandar: any[];
};

const VehicleManagement = () => {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [addVehicleStep, setAddVehicleStep] = useState<1 | 2>(1);

  const [isLoadingVehicles, setIsLoadingVehicles] = useState(false);

  const [isSubmittingAddVehicle, setIsSubmittingAddVehicle] = useState(false);
  const [addVehicleForm, setAddVehicleForm] = useState({
    ownership_mode: 'self_owned' as 'self_owned' | 'contract',
    work_order_id: '',
    vendor_id: '',
    vendor_name: '',
    vehicle_number: '',
    owned_by: 'SBR',
    company: '',
    model: '',
    type: 'Tractor',
    variant: '', fuel_type: 'Diesel', manufacturing_year: '', vehicle_colour: '', capacity: '',
    rental_basis: '', rental_rate: '', contract_from: '', contract_to: '',
    registration_date: '', registration_valid_till: '', chassis_number: '', engine_number: '', registered_owner_name: 'SAI BIORESOURCES PRIVATE LIMITED',
    insurance_provider: '', policy_number: '', fitness_valid_till: '', permit_type: '', road_tax_valid_till: '',
    assigned_company: 'SAI BIORESOURCES PRIVATE LIMITED', project: '', cluster_location: '', assigned_department: '', cost_centre: '', cost_attribution: '',
    primary_driver_id: '', reporting_manager_id: '', current_meter_reading: '', meter_unit: 'KM', assignment_status: 'Unassigned',
    fuel_tank_capacity: '', expected_consumption: '', fuel_card_tag_no: '', service_interval: '', service_interval_unit: 'KM',
    last_service_reading: '', next_service_due: '', vehicle_status: 'Active',
    insurance_validity: '',
    permit_validity: '',
    pollution_cert_validity: '',
    servicing_responsibility: 'SBR' as 'vendor' | 'SBR',
    last_service_date: '',
    last_service_km: '',
  });
  const [insuranceFile, setInsuranceFile] = useState<File | null>(null);
  const [permitFile, setPermitFile] = useState<File | null>(null);
  const [pollutionFile, setPollutionFile] = useState<File | null>(null);
  const [rcFile, setRcFile] = useState<File | null>(null);
  const [vehiclePhotoFiles, setVehiclePhotoFiles] = useState<File[]>([]);
  const [vehiclePhotoPreviews, setVehiclePhotoPreviews] = useState<string[]>([]);
  const [existingVehiclePhotos, setExistingVehiclePhotos] = useState<string[]>([]);

  const [vendorOptions, setVendorOptions] = useState<Array<{ vendor_id: string; vendor_name: string }>>([]);
  const [isLoadingVendors, setIsLoadingVendors] = useState(false);
  const [vendorOrders, setVendorOrders] = useState<Array<{ flow_id: string; order_number: string; order_type: string; status: string }>>([]);
  const [isLoadingVendorOrders, setIsLoadingVendorOrders] = useState(false);

  const baseUrl = useMemo(() => getBaseUrl().replace(/\/$/, ''), []);
  const accountingDimensions = useMemo(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem('sbr-accounting-master-v1') || '{}');
      const costing = parsed?.costing ?? {};
      const registeredCentres = JSON.parse(localStorage.getItem('sbr-cost-accounting-centres-v1') || '[]');
      const registeredAttributions = JSON.parse(localStorage.getItem('sbr-cost-attributions-v1') || '[]');
      const centreByCode = new Map<string, any>();
      [
        ...(Array.isArray(costing.costCentres) ? costing.costCentres : []),
        ...(Array.isArray(registeredCentres) ? registeredCentres.filter((item) => item?.status === 'Active') : []),
      ].forEach((item) => centreByCode.set(String(item?.code || item?.id), item));
      return {
        projects: Array.isArray(costing.projects) ? costing.projects : [],
        departments: Array.isArray(costing.departments) ? costing.departments : [],
        costCentres: Array.from(centreByCode.values()),
        costAttributions: Array.isArray(registeredAttributions)
          ? registeredAttributions.filter((item) => item?.status === 'Active')
          : [],
      };
    } catch {
      return { projects: [], departments: [], costCentres: [], costAttributions: [] };
    }
  }, []);

  const [fuelLogsVehicle, setFuelLogsVehicle] = useState<Vehicle | null>(null);
  const [papersVehicle, setPapersVehicle] = useState<Vehicle | null>(null);
  const [serviceLogsVehicle, setServiceLogsVehicle] = useState<Vehicle | null>(null);
  const [calendarVehicle, setCalendarVehicle] = useState<Vehicle | null>(null);
  const [assignVehicle, setAssignVehicle] = useState<Vehicle | null>(null);

  const [staffOptions, setStaffOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [isLoadingStaff, setIsLoadingStaff] = useState(false);
  const [selectedStaffId, setSelectedStaffId] = useState<string>('');
  const [isSubmittingAssignment, setIsSubmittingAssignment] = useState(false);

  const normalizeAssignedStaff = (raw: any): any[] => {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'object') return [raw];
    return [];
  };

  const getAssignedStaffName = (assignedStaffRaw: any): string => {
    const assignedStaff = normalizeAssignedStaff(assignedStaffRaw);
    if (assignedStaff.length === 0) return 'Unassigned';
    const first = assignedStaff[0];
    return safeText(
      first?.staff_information?.name ||
      first?.staff_information?.full_name ||
      first?.staff_information?.staff_name ||
      first?.name ||
      first?.full_name ||
      first?.staff_name ||
      first?.staff_id,
      'Unassigned',
    );
  };

  const getAssignedStaffId = (assignedStaffRaw: any): string => {
    const assignedStaff = normalizeAssignedStaff(assignedStaffRaw);
    if (assignedStaff.length === 0) return '';
    const first = assignedStaff[0];
    return first?.staff_id || first?.id || '';
  };

  const normalizeFuelLog = (log: any) => {
    return {
      date: log?.date || log?.created_at || log?.log_date || '',
      volume: log?.volume ?? log?.liters ?? log?.quantity ?? '',
      type: log?.type || log?.fuel_type || '',
      amount: log?.amount ?? log?.cost ?? log?.price ?? '',
    };
  };

  const normalizeCalendarEntry = (entry: any) => {
    return {
      date: entry?.date || entry?.created_at || entry?.day || '',
      startingOdometer: entry?.starting_odometer ?? entry?.start_odometer ?? entry?.opening_odometer ?? entry?.odometer_start ?? '',
      closingOdometer: entry?.closing_odometer ?? entry?.end_odometer ?? entry?.odometer_end ?? entry?.current_odometer ?? '',
      from: entry?.from ?? entry?.from_location ?? entry?.origin ?? entry?.source ?? '',
      to: entry?.to ?? entry?.to_location ?? entry?.destination ?? entry?.location ?? entry?.farm_id ?? '',
      purpose: entry?.purpose || entry?.description || entry?.activity_type || entry?.activity || entry?.type || '',
    };
  };

  const getLastSixMonths = () => {
    const now = new Date();
    const months: Array<{ key: string; label: string; start: Date; end: Date }> = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      const key = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`;
      const label = start.toLocaleString(undefined, { month: 'short', year: 'numeric' });
      months.push({ key, label, start, end });
    }
    return months;
  };

  const getMonthKeyForDate = (value: string) => {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };

  const fetchStaffOptions = async () => {
    if (staffOptions.length > 0) return;
    setIsLoadingStaff(true);
    try {
      const response = await fetch(`${baseUrl}/admin_staff/get_all_staff`, { method: 'GET' });
      let data: any = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }
      if (!response.ok) {
        toast.error(data?.message || 'Failed to load staff');
        return;
      }
      const list: any[] = Array.isArray(data) ? data : [];
      setStaffList(list);
      const mapped = list
        .map((s) => ({
          id: s?.staff_id || s?.id || '',
          name:
            s?.staff_information?.staff_name ||
            s?.staff_information?.name ||
            s?.staff_information?.full_name ||
            s?.name ||
            s?.full_name ||
            s?.staff_id ||
            'Unnamed',
        }))
        .filter((s) => s.id);
      setStaffOptions(mapped);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to load staff');
    } finally {
      setIsLoadingStaff(false);
    }
  };

  const fetchVehicles = async () => {
    setIsLoadingVehicles(true);
    try {
      const response = await fetch(`${baseUrl}/admin_vehicles/get_all_vehicles`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      let data: any = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }

      if (!response.ok) {
        toast.error(data?.message || 'Failed to load vehicles');
        setVehicles([]);
        return;
      }

      const list: ApiVehicle[] = Array.isArray(data) ? data : [];
      const mapped: Vehicle[] = list.map((v) => {
        const info = v.vehicle_information;
        const ownedByRaw = info?.owned_by ?? '';
        const ownerType: Vehicle['ownerType'] = ownedByRaw?.toLowerCase() === 'sbr' ? 'Owned' : 'Hired';
        const vehicleType = (info?.type || 'Other') as Vehicle['vehicleType'];
        return {
          id: v.vehicle_id,
          registrationNo: info?.vehicle_number ?? '',
          ownerType,
          ownedByRaw,
          vehicleType,
          make: info?.company ?? '',
          model: info?.model ?? '',
          status: (['Active', 'Under Maintenance', 'Out of Service', 'Contract Expired', 'Sold/Disposed', 'Inactive'].includes(String(info?.vehicle_status)) ? info?.vehicle_status : 'Active') as Vehicle['status'],
          lastServiceDate: info?.last_service_date,
          assignedStaff: normalizeAssignedStaff(v.assigned_staff),
          fuelLogs: Array.isArray(v.fuel_logs) ? v.fuel_logs : [],
          serviceHistory: Array.isArray(v.servise_history) ? v.servise_history : [],
          workCalendar: Array.isArray(v.work_calandar) ? v.work_calandar : [],
          photos: [
            ...(Array.isArray(info?.vehicle_photos) ? info.vehicle_photos : []),
            ...(Array.isArray(info?.vehicle_photo_urls) ? info.vehicle_photo_urls : []),
            info?.vehicle_photo_url,
            info?.photo_url,
          ].filter((value): value is string => typeof value === 'string' && Boolean(value.trim())),
          information: info,
        };
      });

      setVehicles(mapped);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to load vehicles');
      setVehicles([]);
    } finally {
      setIsLoadingVehicles(false);
    }
  };

  useEffect(() => {
    fetchVehicles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stats
  const stats = {
    total: vehicles.length,
    active: vehicles.filter(v => v.status === 'Active').length,
    inService: vehicles.filter(v => v.status === 'Under Maintenance').length,
  };

  // --- ACTIONS ---
  
  const handleBulkUpload = () => {
    toast.success("Bulk upload template downloaded");
  };

  const fetchVendorOptions = async (): Promise<Array<{ vendor_id: string; vendor_name: string }>> => {
    if (vendorOptions.length > 0) return vendorOptions;
    setIsLoadingVendors(true);
    try {
      const res = await fetch(`${baseUrl}/purchase_flow/get_vendors`);
      const data = await res.json().catch(() => ({}));
      const list: Array<{ vendor_id: string; vendor_name: string }> = Array.isArray(data?.vendors) ? data.vendors : [];
      const filtered = list.filter((v) => v?.vendor_id);
      setVendorOptions(filtered);
      return filtered;
    } catch {
      toast.error('Failed to load vendors');
      return [];
    } finally {
      setIsLoadingVendors(false);
    }
  };

  const fetchOrdersForVendor = async (vendorId: string) => {
    setVendorOrders([]);
    if (!vendorId) return;
    setIsLoadingVendorOrders(true);
    try {
      const res = await fetch(`${baseUrl}/purchase_flow/get_order_info_by_vendor_id/${vendorId}`);
      const data = await res.json().catch(() => ({}));
      const list = Array.isArray(data?.purchase_flows) ? data.purchase_flows : [];
      setVendorOrders(list.filter((o: any) => o?.order_number));
    } catch {
      toast.error('Failed to load orders for this vendor');
    } finally {
      setIsLoadingVendorOrders(false);
    }
  };

  const handleOwnershipModeChange = async (mode: 'self_owned' | 'contract') => {
    setAddVehicleForm((prev) => ({
      ...prev,
      ownership_mode: mode,
      owned_by: mode === 'self_owned' ? 'SBR' : '',
      work_order_id: '',
      vendor_id: '',
      vendor_name: '',
    }));
    setVendorOrders([]);
    if (mode === 'contract') {
      fetchVendorOptions();
    }
  };

  const handleVendorSelect = (vendorId: string) => {
    const v = vendorOptions.find((x) => x.vendor_id === vendorId);
    setAddVehicleForm((prev) => ({
      ...prev,
      vendor_id: vendorId,
      vendor_name: v?.vendor_name || '',
      owned_by: v?.vendor_name || prev.owned_by,
      work_order_id: '', // vendor changed — whatever order was picked may no longer belong to them
    }));
    fetchOrdersForVendor(vendorId);
  };

  const handleWorkOrderSelect = (woId: string) => {
    setAddVehicleForm((prev) => ({ ...prev, work_order_id: woId }));
  };

  const uploadDocument = async (file: File): Promise<string> => {
    const res = await fetch(`${baseUrl}/s3/generate-upload-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_name: file.name, file_type: file.type || 'application/octet-stream' }),
    });
    if (!res.ok) throw new Error('Failed to get upload URL');
    const data = await res.json();
    const formData = new FormData();
    Object.entries(data.fields || {}).forEach(([k, v]) => formData.append(k, v as string));
    formData.append('file', file);
    const uploadRes = await fetch(data.upload_url, { method: 'POST', body: formData });
    if (!uploadRes.ok) throw new Error(`Failed to upload ${file.name}`);
    return data.file_key as string;
  };

  const uploadVehiclePhoto = async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('image', file);
    formData.append('document_type', 'vehicle_photo');
    const response = await fetch(`${baseUrl}/admin_staff/add_document_to_s3`, {
      method: 'POST',
      body: formData,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.success || !data?.image_url) {
      throw new Error(data?.message || `Failed to upload ${file.name}`);
    }
    return String(data.image_url);
  };

  const handleVehiclePhotosChange = (files: FileList | null) => {
    const selected = Array.from(files ?? []).filter((file) => file.type.startsWith('image/'));
    if (selected.length === 0) return;
    const availableSlots = Math.max(0, 5 - existingVehiclePhotos.length - vehiclePhotoFiles.length);
    const accepted = selected.slice(0, availableSlots);
    if (accepted.length < selected.length) toast.info('You can upload up to 5 vehicle photos.');
    setVehiclePhotoFiles((current) => [...current, ...accepted]);
    accepted.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => setVehiclePhotoPreviews((current) => [...current, String(reader.result ?? '')]);
      reader.readAsDataURL(file);
    });
  };

  const removeVehiclePhoto = (index: number) => {
    setVehiclePhotoFiles((current) => current.filter((_, itemIndex) => itemIndex !== index));
    setVehiclePhotoPreviews((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };

  const resetAddVehicleForm = () => {
    setAddVehicleForm({
      ownership_mode: 'self_owned',
      work_order_id: '',
      vendor_id: '',
      vendor_name: '',
      vehicle_number: '',
      owned_by: 'SBR',
      company: '',
      model: '',
      type: 'Tractor',
      variant: '', fuel_type: 'Diesel', manufacturing_year: '', vehicle_colour: '', capacity: '',
      rental_basis: '', rental_rate: '', contract_from: '', contract_to: '',
      registration_date: '', registration_valid_till: '', chassis_number: '', engine_number: '', registered_owner_name: 'SAI BIORESOURCES PRIVATE LIMITED',
      insurance_provider: '', policy_number: '', fitness_valid_till: '', permit_type: '', road_tax_valid_till: '',
      assigned_company: 'SAI BIORESOURCES PRIVATE LIMITED', project: '', cluster_location: '', assigned_department: '', cost_centre: '', cost_attribution: '',
      primary_driver_id: '', reporting_manager_id: '', current_meter_reading: '', meter_unit: 'KM', assignment_status: 'Unassigned',
      fuel_tank_capacity: '', expected_consumption: '', fuel_card_tag_no: '', service_interval: '', service_interval_unit: 'KM',
      last_service_reading: '', next_service_due: '', vehicle_status: 'Active',
      insurance_validity: '',
      permit_validity: '',
      pollution_cert_validity: '',
      servicing_responsibility: 'SBR',
      last_service_date: '',
      last_service_km: '',
    });
    setInsuranceFile(null);
    setPermitFile(null);
    setPollutionFile(null);
    setRcFile(null);
    setVehiclePhotoFiles([]);
    setVehiclePhotoPreviews([]);
    setExistingVehiclePhotos([]);
  };

  const submitAddVehicle = async () => {
    if (!addVehicleForm.vehicle_number.trim()) {
      toast.error('Vehicle number is required');
      setAddVehicleStep(1);
      return;
    }

    if (addVehicleForm.ownership_mode === 'contract' && !addVehicleForm.work_order_id) {
      toast.error('Please select a work order');
      setAddVehicleStep(1);
      return;
    }

    if (addVehicleForm.servicing_responsibility === 'SBR' && !addVehicleForm.last_service_date) {
      toast.error('Last servicing date is required when SBR handles servicing');
      setAddVehicleStep(2);
      return;
    }

    setIsSubmittingAddVehicle(true);
    try {
      const [insuranceDocKey, permitDocKey, pollutionDocKey, rcDocKey, vehiclePhotoUrls] = await Promise.all([
        insuranceFile ? uploadDocument(insuranceFile) : Promise.resolve(''),
        permitFile ? uploadDocument(permitFile) : Promise.resolve(''),
        pollutionFile ? uploadDocument(pollutionFile) : Promise.resolve(''),
        rcFile ? uploadDocument(rcFile) : Promise.resolve(''),
        Promise.all(vehiclePhotoFiles.map(uploadVehiclePhoto)),
      ]);

      const currentVehicle = editingVehicleId ? vehicles.find((vehicle) => vehicle.id === editingVehicleId) : null;
      const payload = {
        ...(editingVehicleId ? { vehicle_id: editingVehicleId } : {}),
        vehicle_information: {
          ...(currentVehicle?.information ?? {}),
          ...addVehicleForm,
          vehicle_number: addVehicleForm.vehicle_number.trim(),
          owned_by: addVehicleForm.owned_by,
          company: addVehicleForm.company,
          model: addVehicleForm.model,
          type: addVehicleForm.type,
          last_service_date: addVehicleForm.last_service_date,
          ownership_mode: addVehicleForm.ownership_mode,
          work_order_id: addVehicleForm.work_order_id,
          vendor_id: addVehicleForm.vendor_id,
          vendor_name: addVehicleForm.vendor_name,
          insurance_validity: addVehicleForm.insurance_validity,
          insurance_doc_key: insuranceDocKey,
          permit_validity: addVehicleForm.permit_validity,
          permit_doc_key: permitDocKey,
          pollution_cert_validity: addVehicleForm.pollution_cert_validity,
          pollution_cert_doc_key: pollutionDocKey,
          rc_doc_key: rcDocKey || String(currentVehicle?.information?.rc_doc_key ?? ''),
          servicing_responsibility: addVehicleForm.servicing_responsibility,
          last_service_km: addVehicleForm.last_service_km ? Number(addVehicleForm.last_service_km) : undefined,
          vehicle_photos: [...existingVehiclePhotos, ...vehiclePhotoUrls],
        },
        assigned_staff: addVehicleForm.primary_driver_id
          ? [{ staff_id: addVehicleForm.primary_driver_id }]
          : (currentVehicle?.assignedStaff ?? []),
        servise_history: [],
        fuel_logs: [],
        work_calandar: [],
      };

      const endpoint = editingVehicleId ? 'update_vehicle_information' : 'add_vehicle';
      const response = await fetch(`${baseUrl}/admin_vehicles/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      let data: any = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }

      if (!response.ok) {
        toast.error(data?.message || (editingVehicleId ? 'Failed to update vehicle' : 'Failed to add vehicle'));
        return;
      }

      if ((data?.status && data.status !== 'success') || data?.success === false) {
        toast.error(data?.message || (editingVehicleId ? 'Failed to update vehicle' : 'Failed to add vehicle'));
        return;
      }

      toast.success(editingVehicleId ? 'Vehicle updated successfully' : 'Vehicle onboarded successfully');
      setIsAddModalOpen(false);
      setEditingVehicleId(null);
      setAddVehicleStep(1);
      resetAddVehicleForm();
      fetchVehicles();
    } catch (error: any) {
      toast.error(error?.message || (editingVehicleId ? 'Failed to update vehicle' : 'Failed to add vehicle'));
    } finally {
      setIsSubmittingAddVehicle(false);
    }
  };

  const handleCloseAddModal = () => {
    setIsAddModalOpen(false);
    setEditingVehicleId(null);
    setAddVehicleStep(1);
    resetAddVehicleForm();
  };

  const handleOpenAddModal = () => {
    resetAddVehicleForm();
    setEditingVehicleId(null);
    setAddVehicleStep(1);
    setIsAddModalOpen(true);
  };

  const handleOpenEditModal = (vehicle: Vehicle) => {
    const info = vehicle.information;
    setEditingVehicleId(vehicle.id);
    setAddVehicleForm({
      ownership_mode: info.ownership_mode || (vehicle.ownerType === 'Owned' ? 'self_owned' : 'contract'),
      work_order_id: info.work_order_id || '',
      vendor_id: info.vendor_id || '',
      vendor_name: info.vendor_name || '',
      vehicle_number: vehicle.registrationNo,
      owned_by: vehicle.ownedByRaw,
      company: vehicle.make,
      model: vehicle.model,
      type: vehicle.vehicleType,
      variant: String(info.variant || ''), fuel_type: String(info.fuel_type || 'Diesel'), manufacturing_year: String(info.manufacturing_year || ''), vehicle_colour: String(info.vehicle_colour || ''), capacity: String(info.capacity || ''),
      rental_basis: String(info.rental_basis || ''), rental_rate: String(info.rental_rate || ''), contract_from: String(info.contract_from || ''), contract_to: String(info.contract_to || ''),
      registration_date: String(info.registration_date || ''), registration_valid_till: String(info.registration_valid_till || ''), chassis_number: String(info.chassis_number || ''), engine_number: String(info.engine_number || ''), registered_owner_name: String(info.registered_owner_name || 'SAI BIORESOURCES PRIVATE LIMITED'),
      insurance_provider: String(info.insurance_provider || ''), policy_number: String(info.policy_number || ''), fitness_valid_till: String(info.fitness_valid_till || ''), permit_type: String(info.permit_type || ''), road_tax_valid_till: String(info.road_tax_valid_till || ''),
      assigned_company: String(info.assigned_company || 'SAI BIORESOURCES PRIVATE LIMITED'), project: String(info.project || ''), cluster_location: String(info.cluster_location || ''), assigned_department: String(info.assigned_department || ''), cost_centre: String(info.cost_centre || ''), cost_attribution: String(info.cost_attribution || ''),
      primary_driver_id: getAssignedStaffId(vehicle.assignedStaff), reporting_manager_id: String(info.reporting_manager_id || ''), current_meter_reading: String(info.current_meter_reading || ''), meter_unit: String(info.meter_unit || 'KM'), assignment_status: String(info.assignment_status || 'Unassigned'),
      fuel_tank_capacity: String(info.fuel_tank_capacity || ''), expected_consumption: String(info.expected_consumption || ''), fuel_card_tag_no: String(info.fuel_card_tag_no || ''), service_interval: String(info.service_interval || ''), service_interval_unit: String(info.service_interval_unit || 'KM'),
      last_service_reading: String(info.last_service_reading || ''), next_service_due: String(info.next_service_due || ''), vehicle_status: String(info.vehicle_status || 'Active'),
      insurance_validity: info.insurance_validity || '',
      permit_validity: info.permit_validity || '',
      pollution_cert_validity: info.pollution_cert_validity || '',
      servicing_responsibility: info.servicing_responsibility || 'SBR',
      last_service_date: vehicle.lastServiceDate || '',
      last_service_km: info.last_service_km != null ? String(info.last_service_km) : '',
    });
    setExistingVehiclePhotos(vehicle.photos);
    setVehiclePhotoFiles([]);
    setVehiclePhotoPreviews([]);
    setAddVehicleStep(1);
    setIsAddModalOpen(true);
    if (info.ownership_mode === 'contract' || vehicle.ownerType === 'Hired') {
      void fetchVendorOptions();
      if (info.vendor_id) void fetchOrdersForVendor(info.vendor_id);
    }
    void fetchStaffOptions();
  };

  const handleNextVehicleStep = () => {
    if (!addVehicleForm.vehicle_number.trim()) {
      toast.error('Vehicle number is required');
      return;
    }
    if (addVehicleForm.ownership_mode === 'contract' && !addVehicleForm.work_order_id) {
      toast.error('Please select a work order');
      return;
    }
    void fetchStaffOptions();
    setAddVehicleStep(2);
  };

  const toggleServiceStatus = (id: string) => {
    setVehicles(prev => prev.map(v => {
      if (v.id === id) {
        const newStatus: Vehicle['status'] = v.status === 'Active' ? 'Under Maintenance' : 'Active';
        toast.info(newStatus === 'Under Maintenance' ? `Vehicle sent for servicing` : `Vehicle marked as active`);
        return { ...v, status: newStatus };
      }
      return v;
    }));
  };

  // Filter Logic
  const filteredVehicles = vehicles.filter(v => 
    v.registrationNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
    v.make.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen space-y-7 bg-[#fbfcfd] p-4 text-slate-900 sm:p-6 lg:p-8">

      {/* --- HEADER --- */}
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-bold text-emerald-700">Fleet Operations</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950">Vehicle Management</h1>
          <p className="mt-3 text-base font-medium text-slate-600">Onboard fleet, track maintenance, and manage ownership.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={handleBulkUpload}
            className="h-11 gap-2 rounded-xl border border-[#0D3A35]/15 bg-white px-4 font-bold text-[#0D3A35] shadow-sm hover:bg-[#0D3A35]/5"
          >
            <Upload className="w-4 h-4" />
            Bulk Upload
          </Button>
          <Button
            onClick={handleOpenAddModal}
            className="h-11 gap-2 rounded-xl bg-[#0D3A35] px-5 font-bold text-white shadow-sm hover:bg-[#092e2a]"
          >
            <Plus className="w-4 h-4" />
            Add Vehicle
          </Button>
        </div>
      </div>

      {/* --- STATS --- */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_14px_40px_rgba(15,23,42,0.05)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-slate-500">Total Fleet</p>
              <p className="mt-3 text-2xl font-bold text-slate-950">{stats.total}</p>
            </div>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#0D3A35]/10 text-[#0D3A35] ring-2 ring-[#0D3A35]/10">
              <Car className="h-5 w-5" />
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_14px_40px_rgba(15,23,42,0.05)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-slate-500">Active / On Road</p>
              <p className="mt-3 text-2xl font-bold text-emerald-700">{stats.active}</p>
            </div>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 ring-2 ring-emerald-100">
              <Truck className="h-5 w-5" />
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_14px_40px_rgba(15,23,42,0.05)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-slate-500">In Service</p>
              <p className="mt-3 text-2xl font-bold text-orange-600">{stats.inService}</p>
            </div>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-600 ring-2 ring-orange-100">
              <Wrench className="h-5 w-5" />
            </div>
          </div>
        </div>
      </div>

      {/* --- LIST VIEW --- */}
      <div className="space-y-4">
        {/* Search */}
        <div className="relative w-full lg:max-w-md">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search by registration no or make…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-12 rounded-xl border-slate-200 bg-slate-50/70 pl-11 text-sm font-semibold shadow-none focus-visible:ring-emerald-100"
          />
        </div>

        {/* Vehicle cards */}
        {isLoadingVehicles ? (
          <div className="rounded-2xl border border-slate-200/80 bg-white p-8 text-sm font-medium text-slate-500 shadow-sm">Loading vehicles…</div>
        ) : filteredVehicles.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <Car className="mx-auto h-9 w-9 text-slate-300" />
            <p className="mt-3 text-sm font-bold text-slate-700">No vehicles found</p>
            <p className="mt-1 text-xs font-medium text-slate-400">Try another search or add a vehicle to the fleet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2 2xl:grid-cols-3">
            {filteredVehicles.map((vehicle) => (
              <article key={vehicle.id} className="group overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_14px_40px_rgba(15,23,42,0.05)] transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_50px_rgba(15,23,42,0.09)]">
                <div className="relative h-52 overflow-hidden bg-gradient-to-br from-[#0D3A35] via-[#16564d] to-[#0a2926]">
                  {vehicle.photos[0] ? (
                    <img src={vehicle.photos[0]} alt={`${vehicle.registrationNo} vehicle`} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center text-white/80">
                      <Truck className="h-16 w-16 stroke-[1.25]" />
                      <span className="mt-3 text-xs font-bold uppercase tracking-[0.22em] text-white/60">No vehicle photo</span>
                    </div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-slate-950/80 to-transparent" />
                  <div className="absolute left-4 top-4 flex gap-2">
                    <Badge className="border border-white/20 bg-white/90 font-bold text-[#0D3A35] shadow-sm hover:bg-white">{vehicle.vehicleType}</Badge>
                    {vehicle.photos.length > 1 && <Badge className="border border-white/20 bg-slate-950/55 text-white hover:bg-slate-950/55">+{vehicle.photos.length - 1} photos</Badge>}
                  </div>
                  <span className={cn(
                    'absolute right-4 top-4 inline-flex items-center gap-1.5 rounded-full border border-white/20 px-2.5 py-1 text-[10px] font-bold shadow-sm backdrop-blur',
                    vehicle.status === 'Active' ? 'bg-emerald-500/90 text-white' : 'bg-orange-500/90 text-white'
                  )}>
                    <span className="h-1.5 w-1.5 rounded-full bg-white" />
                    {vehicle.status}
                  </span>
                  <div className="absolute bottom-4 left-5 right-5">
                    <h2 className="text-xl font-extrabold tracking-tight text-white">{vehicle.registrationNo || 'Registration pending'}</h2>
                    <p className="mt-0.5 truncate text-sm font-semibold text-white/75">{[vehicle.make, vehicle.model].filter(Boolean).join(' ') || 'Make and model not recorded'}</p>
                  </div>
                </div>

                <div className="space-y-4 p-5">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Ownership</p>
                      <p className="mt-1 truncate text-sm font-bold text-slate-800">{vehicle.ownedByRaw || vehicle.ownerType}</p>
                    </div>
                    <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Last service</p>
                      <p className="mt-1 text-sm font-bold text-slate-800">{vehicle.lastServiceDate || 'Not recorded'}</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={async () => {
                      setAssignVehicle(vehicle);
                      setSelectedStaffId(getAssignedStaffId(vehicle.assignedStaff));
                      await fetchStaffOptions();
                    }}
                    className="flex w-full items-center justify-between rounded-xl border border-slate-200 px-3.5 py-3 text-left transition-colors hover:border-[#0D3A35]/30 hover:bg-[#0D3A35]/5"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#0D3A35]/10 text-[#0D3A35]"><UserRound className="h-4 w-4" /></span>
                      <span className="min-w-0">
                        <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Driver Name</span>
                        <span className="block truncate text-sm font-bold text-slate-800">{getAssignedStaffName(vehicle.assignedStaff)}</span>
                      </span>
                    </span>
                    <span className="text-xs font-bold text-[#0D3A35]">Manage</span>
                  </button>

                  <div className="grid grid-cols-4 gap-2 border-t border-slate-100 pt-4">
                    {[
                      { label: 'Calendar', icon: CalendarDays, action: () => setCalendarVehicle(vehicle) },
                      { label: 'Fuel', icon: Fuel, action: () => setFuelLogsVehicle(vehicle) },
                      { label: 'Papers', icon: FileText, action: () => setPapersVehicle(vehicle) },
                      { label: 'Service log', icon: Wrench, action: () => setServiceLogsVehicle(vehicle) },
                    ].map(({ label, icon: Icon, action }) => (
                      <button key={label} type="button" onClick={action} className="flex min-w-0 flex-col items-center gap-1.5 rounded-xl px-1 py-2 text-[10px] font-bold text-slate-500 transition-colors hover:bg-[#0D3A35]/5 hover:text-[#0D3A35]">
                        <Icon className="h-4 w-4" />
                        <span className="truncate">{label}</span>
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      onClick={() => handleOpenEditModal(vehicle)}
                      className="h-10 rounded-xl border-[#0D3A35]/20 font-bold text-[#0D3A35] hover:bg-[#0D3A35]/5 hover:text-[#0D3A35]"
                    >
                      <Pencil className="mr-2 h-4 w-4" />
                      Edit Vehicle
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => toggleServiceStatus(vehicle.id)}
                      className={cn(
                        'h-10 rounded-xl font-bold',
                        vehicle.status === 'Active'
                          ? 'border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100 hover:text-orange-800'
                          : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800'
                      )}
                    >
                      {vehicle.status === 'Active' ? <Wrench className="mr-2 h-4 w-4" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                      {vehicle.status === 'Active' ? 'Send for Service' : 'Complete Service'}
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {/* Fuel Logs Dialog */}
      <Dialog open={!!fuelLogsVehicle} onOpenChange={(open) => !open && setFuelLogsVehicle(null)}>
        <DialogContent className="max-w-3xl rounded-2xl border-0 p-0">
          <DialogHeader className="bg-[#0D3A35] px-6 py-5 text-white">
            <DialogTitle className="text-lg font-bold text-white">Fuel Logs</DialogTitle>
            <p className="text-xs font-medium text-white/70">
              {fuelLogsVehicle?.registrationNo} • {fuelLogsVehicle?.make} {fuelLogsVehicle?.model}
            </p>
          </DialogHeader>
          <div className="px-6 py-5">
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <ScrollArea className="max-h-[420px]">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">Volume</th>
                      <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">Type</th>
                      <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">Amount (Rs)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(fuelLogsVehicle?.fuelLogs ?? []).length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-6 text-center font-medium text-slate-400">No fuel logs available.</td>
                      </tr>
                    ) : (
                      (fuelLogsVehicle?.fuelLogs ?? []).map((log, idx) => {
                        const row = normalizeFuelLog(log);
                        return (
                          <tr key={idx} className="hover:bg-slate-50/70">
                            <td className="px-4 py-3 font-medium text-slate-700">{row.date || '-'}</td>
                            <td className="px-4 py-3 font-medium text-slate-700">{row.volume !== '' ? row.volume : '-'}</td>
                            <td className="px-4 py-3 font-medium text-slate-700">{row.type || '-'}</td>
                            <td className="px-4 py-3 font-medium text-slate-700">{row.amount !== '' ? row.amount : '-'}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </ScrollArea>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Vehicle Papers Dialog */}
      <Dialog open={!!papersVehicle} onOpenChange={(open) => !open && setPapersVehicle(null)}>
        <DialogContent className="max-w-2xl rounded-2xl border-0 p-0">
          <DialogHeader className="bg-[#0D3A35] px-6 py-5 text-white">
            <DialogTitle className="text-lg font-bold text-white">Vehicle Papers</DialogTitle>
            <p className="text-xs font-medium text-white/70">
              {papersVehicle?.registrationNo} • {papersVehicle?.make} {papersVehicle?.model}
            </p>
          </DialogHeader>
          <div className="px-6 py-5">
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="text-sm font-bold text-slate-800">Documents</div>
              <div className="mt-1 text-sm font-medium text-slate-500">
                No papers available from the backend response yet.
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Servicing Logs Dialog */}
      <Dialog open={!!serviceLogsVehicle} onOpenChange={(open) => !open && setServiceLogsVehicle(null)}>
        <DialogContent className="max-w-3xl rounded-2xl border-0 p-0">
          <DialogHeader className="bg-[#0D3A35] px-6 py-5 text-white">
            <DialogTitle className="text-lg font-bold text-white">Servicing Logs</DialogTitle>
            <p className="text-xs font-medium text-white/70">{serviceLogsVehicle?.registrationNo}</p>
          </DialogHeader>
          <div className="space-y-4 px-6 py-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Last servicing date</div>
                <div className="mt-1 text-sm font-bold text-slate-800">{serviceLogsVehicle?.lastServiceDate || '-'}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Assigned to</div>
                <div className="mt-1 text-sm font-bold text-slate-800">{getAssignedStaffName(serviceLogsVehicle?.assignedStaff ?? [])}</div>
              </div>
            </div>
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <div className="bg-slate-50 px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-500">Service history</div>
              <ScrollArea className="max-h-[360px]">
                {(serviceLogsVehicle?.serviceHistory ?? []).length === 0 ? (
                  <div className="p-6 text-sm font-medium text-slate-400">No service history available.</div>
                ) : (
                  <div className="space-y-2 p-4">
                    {(serviceLogsVehicle?.serviceHistory ?? []).map((item, idx) => (
                      <div key={idx} className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="text-sm font-bold text-slate-800">{item?.date || item?.created_at || `Entry ${idx + 1}`}</div>
                        <div className="mt-1 break-words text-xs font-medium text-slate-500">{typeof item === 'string' ? item : JSON.stringify(item)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Vehicle Calendar Dialog */}
      <Dialog open={!!calendarVehicle} onOpenChange={(open) => !open && setCalendarVehicle(null)}>
        <DialogContent className="max-w-5xl rounded-2xl border-0 p-0">
          <DialogHeader className="bg-[#0D3A35] px-6 py-5 text-white">
            <DialogTitle className="text-lg font-bold text-white">Vehicle Calendar (6 months)</DialogTitle>
            <p className="text-xs font-medium text-white/70">
              {calendarVehicle?.registrationNo} • {calendarVehicle?.make} {calendarVehicle?.model}
            </p>
          </DialogHeader>
          <div className="px-6 py-5">
          {(() => {
            const months = getLastSixMonths();
            const entries = (calendarVehicle?.workCalendar ?? []).map(normalizeCalendarEntry);
            const byMonth: Record<string, typeof entries> = {};
            for (const m of months) byMonth[m.key] = [];
            for (const e of entries) {
              const k = getMonthKeyForDate(e.date) || months[0].key;
              if (!byMonth[k]) byMonth[k] = [];
              byMonth[k].push(e);
            }
            return (
              <Tabs defaultValue={months[0].key} className="w-full">
                <TabsList className="w-full justify-start overflow-x-auto">
                  {months.map((m) => (
                    <TabsTrigger key={m.key} value={m.key} className="whitespace-nowrap">
                      {m.label}
                    </TabsTrigger>
                  ))}
                </TabsList>

                {months.map((m) => (
                  <TabsContent key={m.key} value={m.key} className="mt-4">
                    <div className="overflow-hidden rounded-xl border border-slate-200">
                      <div className="bg-slate-50 px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-500">Work entries</div>
                      <ScrollArea className="max-h-[420px]">
                        <table className="w-full text-sm">
                          <thead className="sticky top-0 bg-slate-50">
                            <tr>
                              <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">Date</th>
                              <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">Starting Odometer</th>
                              <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">Closing Odometer</th>
                              <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">From</th>
                              <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">To</th>
                              <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">Purpose</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {(byMonth[m.key] ?? []).length === 0 ? (
                              <tr>
                                <td colSpan={6} className="px-4 py-6 text-center font-medium text-slate-400">No entries for this month.</td>
                              </tr>
                            ) : (
                              (byMonth[m.key] ?? []).map((e, idx) => (
                                <tr key={idx} className="hover:bg-slate-50/70">
                                  <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-700">{e.date || '-'}</td>
                                  <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-700">{e.startingOdometer !== '' ? e.startingOdometer : '-'}</td>
                                  <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-700">{e.closingOdometer !== '' ? e.closingOdometer : '-'}</td>
                                  <td className="px-4 py-3 font-medium text-slate-700">{e.from || '-'}</td>
                                  <td className="px-4 py-3 font-medium text-slate-700">{e.to || '-'}</td>
                                  <td className="px-4 py-3 font-medium text-slate-700">{e.purpose || '-'}</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </ScrollArea>
                    </div>
                  </TabsContent>
                ))}
              </Tabs>
            );
          })()}
          </div>
        </DialogContent>
      </Dialog>

      {/* Assign Driver Dialog */}
      <Dialog open={!!assignVehicle} onOpenChange={(open) => !open && setAssignVehicle(null)}>
        <DialogContent className="max-w-xl rounded-2xl border-0 p-0">
          <DialogHeader className="bg-[#0D3A35] px-6 py-5 text-white">
            <DialogTitle className="text-lg font-bold text-white">Assign Driver</DialogTitle>
            <p className="text-xs font-medium text-white/70">
              {assignVehicle?.registrationNo} • Current: {getAssignedStaffName(assignVehicle?.assignedStaff ?? [])}
            </p>
          </DialogHeader>
          <div className="space-y-4 px-6 py-5">
            <Field label="Select staff">
              <SelectField
                value={selectedStaffId}
                onChange={setSelectedStaffId}
                disabled={isLoadingStaff}
                placeholder="Select driver"
                options={staffOptions.map((s) => ({ value: s.id, label: s.name }))}
              />
            </Field>

            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              {(() => {
                if (!selectedStaffId) {
                  return <div className="text-sm font-medium text-slate-500">Select a staff member to view details.</div>;
                }

                const selected = staffList.find((s) => (s?.staff_id || s?.id) === selectedStaffId);
                const info = selected?.staff_information;
                const name = safeText(info?.staff_name || info?.name || info?.full_name || selected?.name || selected?.full_name, selectedStaffId);
                const phone = safeText(info?.staff_phone || selected?.staff_phone);
                const department = safeText(info?.staff_department || selected?.staff_department);
                const designation = safeText(info?.staff_designation || selected?.staff_designation);
                const employmentType = safeText(info?.employment_type || selected?.employment_type);

                return (
                  <div className="space-y-3">
                    <div className="text-sm font-bold text-slate-900">{name}</div>
                    <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                        <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Phone</div>
                        <div className="mt-0.5 font-bold text-slate-800">{phone}</div>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                        <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Employment</div>
                        <div className="mt-0.5 font-bold text-slate-800">{employmentType}</div>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                        <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Department</div>
                        <div className="mt-0.5 font-bold text-slate-800">{department}</div>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                        <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Designation</div>
                        <div className="mt-0.5 font-bold text-slate-800">{designation}</div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
          <DialogFooter className="border-t border-slate-100 bg-slate-50/70 px-6 py-4">
            <Button variant="outline" className="rounded-xl font-bold" onClick={() => setAssignVehicle(null)}>Cancel</Button>
            <Button
              disabled={isSubmittingAssignment}
              className="rounded-xl bg-[#0D3A35] font-bold text-white hover:bg-[#092e2a]"
              onClick={() => {
                (async () => {
                  if (!assignVehicle) return;
                  if (!selectedStaffId) {
                    toast.error('Please select a driver');
                    return;
                  }

                  const selected = staffList.find((s) => (s?.staff_id || s?.id) === selectedStaffId);
                  const info = selected?.staff_information;

                  const staff_contact = safeText(info?.staff_phone || selected?.staff_phone, '');
                  const stadd_department = safeText(info?.staff_department || selected?.staff_department, '');
                  const staff_designation = safeText(info?.staff_designation || selected?.staff_designation, '');

                  if (!staff_contact || !stadd_department || !staff_designation) {
                    toast.error('Selected staff is missing contact/department/designation');
                    return;
                  }

                  const payload = {
                    vehicle_id: assignVehicle.id,
                    assigned_staff: {
                      staff_id: selectedStaffId,
                      staff_contact,
                      stadd_department,
                      staff_designation,
                    },
                  };

                  setIsSubmittingAssignment(true);
                  try {
                    const response = await fetch(`${baseUrl}/admin_vehicles/update_vehicle_assignment`, {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        Accept: 'application/json',
                      },
                      body: JSON.stringify(payload),
                    });

                    let data: any = null;
                    try {
                      data = await response.json();
                    } catch {
                      data = null;
                    }

                    if (!response.ok) {
                      toast.error(data?.message || 'Failed to assign driver');
                      return;
                    }

                    if (data?.status && data.status !== 'success') {
                      toast.error(data?.message || 'Failed to assign driver');
                      return;
                    }

                    toast.success('Driver assigned');
                    setAssignVehicle(null);
                    await fetchVehicles();
                  } catch (error: any) {
                    toast.error(error?.message || 'Failed to assign driver');
                  } finally {
                    setIsSubmittingAssignment(false);
                  }
                })();
              }}
            >
              {isSubmittingAssignment ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* --- ADD VEHICLE MODAL --- */}
      <Dialog open={isAddModalOpen} onOpenChange={(open) => !open && handleCloseAddModal()}>
        <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto rounded-2xl border-0 p-0">
          <DialogHeader className="bg-[#0D3A35] px-6 py-5 text-white">
            <DialogTitle className="flex items-center gap-2 text-lg font-bold text-white">
              {editingVehicleId ? <Pencil className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
              {editingVehicleId ? 'Edit Vehicle' : 'Add New Vehicle'}
            </DialogTitle>
            <p className="text-xs font-medium text-white/70">Step {addVehicleStep} of 2</p>
          </DialogHeader>

          <div className="space-y-5 px-6 py-5">
            {addVehicleStep === 1 ? (
              <>
                <Field label="Ownership">
                  <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50/70 p-1">
                    <button
                      type="button"
                      onClick={() => handleOwnershipModeChange('self_owned')}
                      className={cn(
                        'flex-1 rounded-lg px-3 py-2 text-sm font-bold transition-colors',
                        addVehicleForm.ownership_mode === 'self_owned' ? 'bg-[#0D3A35] text-white shadow-sm' : 'text-slate-600 hover:bg-white'
                      )}
                    >
                      Self-Owned
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOwnershipModeChange('contract')}
                      className={cn(
                        'flex-1 rounded-lg px-3 py-2 text-sm font-bold transition-colors',
                        addVehicleForm.ownership_mode === 'contract' ? 'bg-[#0D3A35] text-white shadow-sm' : 'text-slate-600 hover:bg-white'
                      )}
                    >
                      Contract / Rental
                    </button>
                  </div>
                </Field>

                {addVehicleForm.ownership_mode === 'contract' && (
                  <div className="grid grid-cols-1 gap-4 rounded-2xl border border-amber-200/70 bg-amber-50/40 p-4 sm:grid-cols-2">
                    <Field label="Vendor" required>
                      <SelectField
                        value={addVehicleForm.vendor_id}
                        onChange={handleVendorSelect}
                        disabled={isLoadingVendors}
                        placeholder={isLoadingVendors ? 'Loading…' : 'Select vendor'}
                        options={vendorOptions.map((v) => ({ value: v.vendor_id, label: v.vendor_name }))}
                      />
                    </Field>
                    <Field label="Work Order" required>
                      <SelectField
                        value={addVehicleForm.work_order_id}
                        onChange={handleWorkOrderSelect}
                        disabled={isLoadingVendorOrders || !addVehicleForm.vendor_id}
                        placeholder={isLoadingVendorOrders ? 'Loading…' : !addVehicleForm.vendor_id ? 'Select a vendor first' : 'Select order'}
                        options={vendorOrders.map((o) => ({ value: o.order_number, label: `${o.order_number} (${o.order_type} · ${o.status})` }))}
                      />
                      {addVehicleForm.vendor_id && vendorOrders.length === 0 && !isLoadingVendorOrders && (
                        <p className="text-xs font-semibold text-amber-600">No live orders found for this vendor.</p>
                      )}
                    </Field>
                    <Field label="Rental Basis">
                      <SelectField value={addVehicleForm.rental_basis} onChange={(v) => setAddVehicleForm((prev) => ({ ...prev, rental_basis: v }))} placeholder="Select rental basis" options={['Monthly', 'Daily', 'Hourly', 'Per KM'].map((value) => ({ value, label: value }))} />
                    </Field>
                    <Field label="Rental Rate">
                      <Input type="number" min="0" value={addVehicleForm.rental_rate} onChange={(e) => setAddVehicleForm((prev) => ({ ...prev, rental_rate: e.target.value }))} className="rounded-xl border-slate-200 bg-white font-semibold" placeholder="₹ 40,000" />
                    </Field>
                    <Field label="Contract From">
                      <Input type="date" value={addVehicleForm.contract_from} onChange={(e) => setAddVehicleForm((prev) => ({ ...prev, contract_from: e.target.value }))} className="rounded-xl border-slate-200 bg-white font-semibold" />
                    </Field>
                    <Field label="Contract To">
                      <Input type="date" value={addVehicleForm.contract_to} onChange={(e) => setAddVehicleForm((prev) => ({ ...prev, contract_to: e.target.value }))} className="rounded-xl border-slate-200 bg-white font-semibold" />
                    </Field>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <Field label="Vehicle Number" required>
                    <Input
                      required
                      value={addVehicleForm.vehicle_number}
                      onChange={(e) => setAddVehicleForm((prev) => ({ ...prev, vehicle_number: e.target.value }))}
                      className="rounded-xl border-slate-200 bg-slate-50/70 font-semibold"
                      placeholder="MH12AB1234"
                    />
                  </Field>
                  <Field label="Owned By">
                    <Input
                      readOnly
                      value={addVehicleForm.owned_by || (addVehicleForm.ownership_mode === 'contract' ? 'Select a vendor' : 'SBR')}
                      className="rounded-xl border-slate-200 bg-slate-100 font-semibold text-slate-600"
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <Field label="Make / Manufacturer">
                    <Input
                      value={addVehicleForm.company}
                      onChange={(e) => setAddVehicleForm((prev) => ({ ...prev, company: e.target.value }))}
                      className="rounded-xl border-slate-200 bg-slate-50/70 font-semibold"
                      placeholder="Tata, Mahindra, etc."
                    />
                  </Field>
                  <Field label="Model">
                    <Input
                      value={addVehicleForm.model}
                      onChange={(e) => setAddVehicleForm((prev) => ({ ...prev, model: e.target.value }))}
                      className="rounded-xl border-slate-200 bg-slate-50/70 font-semibold"
                      placeholder="e.g. Prima"
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Vehicle Type">
                    <SelectField value={addVehicleForm.type} onChange={(v) => setAddVehicleForm((prev) => ({ ...prev, type: v, meter_unit: ['Tractor', 'JCB', 'Harvester'].includes(v) ? 'Hours' : 'KM', service_interval_unit: ['Tractor', 'JCB', 'Harvester'].includes(v) ? 'Hours' : 'KM' }))} placeholder="Select type" options={['Pickup', 'Car', 'Tractor', 'Truck', 'JCB', 'Bike', 'Tipper', 'Harvester', 'Other'].map((value) => ({ value, label: value }))} />
                  </Field>
                  <Field label="Fuel Type">
                    <SelectField value={addVehicleForm.fuel_type} onChange={(v) => setAddVehicleForm((prev) => ({ ...prev, fuel_type: v }))} placeholder="Select fuel type" options={['Diesel', 'Petrol', 'CNG', 'EV'].map((value) => ({ value, label: value }))} />
                  </Field>
                  <Field label="Variant">
                    <Input value={addVehicleForm.variant} onChange={(e) => setAddVehicleForm((prev) => ({ ...prev, variant: e.target.value }))} className="rounded-xl border-slate-200 bg-slate-50/70 font-semibold" placeholder="4WD / 2WD" />
                  </Field>
                  <Field label="Manufacturing Year">
                    <Input type="number" min="1950" max="2100" value={addVehicleForm.manufacturing_year} onChange={(e) => setAddVehicleForm((prev) => ({ ...prev, manufacturing_year: e.target.value }))} className="rounded-xl border-slate-200 bg-slate-50/70 font-semibold" placeholder="2024" />
                  </Field>
                  <Field label="Vehicle Colour">
                    <Input value={addVehicleForm.vehicle_colour} onChange={(e) => setAddVehicleForm((prev) => ({ ...prev, vehicle_colour: e.target.value }))} className="rounded-xl border-slate-200 bg-slate-50/70 font-semibold" placeholder="White" />
                  </Field>
                  <Field label="Seating / Load Capacity">
                    <Input value={addVehicleForm.capacity} onChange={(e) => setAddVehicleForm((prev) => ({ ...prev, capacity: e.target.value }))} className="rounded-xl border-slate-200 bg-slate-50/70 font-semibold" placeholder="1.5 Ton / 5 Seats" />
                  </Field>
                </div>

                <Field label="Vehicle Photos">
                  <label className="group flex cursor-pointer items-center gap-4 rounded-2xl border border-dashed border-[#0D3A35]/25 bg-[#0D3A35]/[0.035] p-4 transition-colors hover:border-[#0D3A35]/45 hover:bg-[#0D3A35]/[0.06]">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#0D3A35]/10 text-[#0D3A35]">
                      <ImagePlus className="h-5 w-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-bold text-slate-800">Upload vehicle photos</span>
                      <span className="mt-0.5 block text-xs font-medium text-slate-500">JPG, PNG or WebP · up to 5 photos</span>
                    </span>
                    <span className="ml-auto rounded-lg bg-white px-3 py-2 text-xs font-bold text-[#0D3A35] shadow-sm ring-1 ring-slate-200">Choose</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      multiple
                      disabled={existingVehiclePhotos.length + vehiclePhotoFiles.length >= 5}
                      onChange={(event) => {
                        handleVehiclePhotosChange(event.target.files);
                        event.target.value = '';
                      }}
                      className="sr-only"
                    />
                  </label>
                  {(existingVehiclePhotos.length > 0 || vehiclePhotoPreviews.length > 0) && (
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                      {existingVehiclePhotos.map((photo, index) => (
                        <div key={photo} className="group/photo relative aspect-square overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                          <img src={photo} alt={`Saved vehicle ${index + 1}`} className="h-full w-full object-cover" />
                          <button
                            type="button"
                            onClick={() => setExistingVehiclePhotos((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                            aria-label={`Remove saved vehicle photo ${index + 1}`}
                            className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-slate-950/70 text-white opacity-0 transition-opacity group-hover/photo:opacity-100 focus:opacity-100"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                      {vehiclePhotoPreviews.map((preview, index) => (
                        <div key={`${preview.slice(0, 32)}-${index}`} className="group/photo relative aspect-square overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                          <img src={preview} alt={`Vehicle upload ${index + 1}`} className="h-full w-full object-cover" />
                          <button
                            type="button"
                            onClick={() => removeVehiclePhoto(index)}
                            aria-label={`Remove vehicle photo ${index + 1}`}
                            className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-slate-950/70 text-white opacity-0 transition-opacity group-hover/photo:opacity-100 focus:opacity-100"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </Field>
              </>
            ) : (
              <>
                <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/40 p-4">
                  <div><p className="text-sm font-bold text-slate-800">Registration Details</p><p className="text-xs font-medium text-slate-500">Registration identity and ownership documents.</p></div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <Field label="Registration Date"><Input type="date" value={addVehicleForm.registration_date} onChange={(e) => setAddVehicleForm((prev) => ({ ...prev, registration_date: e.target.value }))} className="rounded-xl border-slate-200 bg-white font-semibold" /></Field>
                    <Field label="Registration Valid Till"><Input type="date" value={addVehicleForm.registration_valid_till} onChange={(e) => setAddVehicleForm((prev) => ({ ...prev, registration_valid_till: e.target.value }))} className="rounded-xl border-slate-200 bg-white font-semibold" /></Field>
                    <Field label="Registered Owner Name"><Input value={addVehicleForm.registered_owner_name} onChange={(e) => setAddVehicleForm((prev) => ({ ...prev, registered_owner_name: e.target.value }))} className="rounded-xl border-slate-200 bg-white font-semibold" /></Field>
                    <Field label="Chassis Number"><Input value={addVehicleForm.chassis_number} onChange={(e) => setAddVehicleForm((prev) => ({ ...prev, chassis_number: e.target.value }))} className="rounded-xl border-slate-200 bg-white font-semibold" placeholder="MA1XXXXXXX" /></Field>
                    <Field label="Engine Number"><Input value={addVehicleForm.engine_number} onChange={(e) => setAddVehicleForm((prev) => ({ ...prev, engine_number: e.target.value }))} className="rounded-xl border-slate-200 bg-white font-semibold" placeholder="ENGXXXXXX" /></Field>
                    <Field label="RC Upload"><input type="file" accept="image/*,.pdf" onChange={(e) => setRcFile(e.target.files?.[0] || null)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-[#0D3A35]/10 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-[#0D3A35]" /></Field>
                  </div>
                </div>

                <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/40 p-4">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-[#0D3A35]" />
                    <div>
                      <p className="text-sm font-bold text-slate-800">Insurance & Compliance</p>
                      <p className="text-xs font-medium text-slate-500">Only compliance relevant to the selected vehicle type is shown.</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <Field label="Insurance Provider"><Input value={addVehicleForm.insurance_provider} onChange={(e) => setAddVehicleForm((prev) => ({ ...prev, insurance_provider: e.target.value }))} className="rounded-xl border-slate-200 bg-white font-semibold" placeholder="Insurance company" /></Field>
                    <Field label="Policy Number"><Input value={addVehicleForm.policy_number} onChange={(e) => setAddVehicleForm((prev) => ({ ...prev, policy_number: e.target.value }))} className="rounded-xl border-slate-200 bg-white font-semibold" /></Field>
                    <Field label="Insurance Valid Till">
                      <Input
                        type="date"
                        value={addVehicleForm.insurance_validity}
                        onChange={(e) => setAddVehicleForm((prev) => ({ ...prev, insurance_validity: e.target.value }))}
                        className="rounded-xl border-slate-200 bg-white font-semibold"
                      />
                    </Field>
                    <Field label="Insurance Document">
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        onChange={(e) => setInsuranceFile(e.target.files?.[0] || null)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-[#0D3A35]/10 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-[#0D3A35] hover:file:bg-[#0D3A35]/15"
                      />
                    </Field>

                    {addVehicleForm.fuel_type !== 'EV' && <Field label="PUC Valid Till">
                      <Input
                        type="date"
                        value={addVehicleForm.pollution_cert_validity}
                        onChange={(e) => setAddVehicleForm((prev) => ({ ...prev, pollution_cert_validity: e.target.value }))}
                        className="rounded-xl border-slate-200 bg-white font-semibold"
                      />
                    </Field>}
                    <Field label="Pollution Certificate Document">
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        onChange={(e) => setPollutionFile(e.target.files?.[0] || null)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-[#0D3A35]/10 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-[#0D3A35] hover:file:bg-[#0D3A35]/15"
                      />
                    </Field>
                    {['Truck', 'Tractor', 'JCB', 'Tipper', 'Pickup', 'Harvester'].includes(addVehicleForm.type) && <>
                      <Field label="Fitness Valid Till"><Input type="date" value={addVehicleForm.fitness_valid_till} onChange={(e) => setAddVehicleForm((prev) => ({ ...prev, fitness_valid_till: e.target.value }))} className="rounded-xl border-slate-200 bg-white font-semibold" /></Field>
                      <Field label="Permit Type"><SelectField value={addVehicleForm.permit_type} onChange={(v) => setAddVehicleForm((prev) => ({ ...prev, permit_type: v }))} placeholder="Select permit" options={['National', 'State', 'Goods Carriage', 'Contract Carriage', 'Agricultural', 'Not Applicable'].map((value) => ({ value, label: value }))} /></Field>
                      <Field label="Permit Valid Till"><Input type="date" value={addVehicleForm.permit_validity} onChange={(e) => setAddVehicleForm((prev) => ({ ...prev, permit_validity: e.target.value }))} className="rounded-xl border-slate-200 bg-white font-semibold" /></Field>
                      <Field label="Road Tax Valid Till"><Input type="date" value={addVehicleForm.road_tax_valid_till} onChange={(e) => setAddVehicleForm((prev) => ({ ...prev, road_tax_valid_till: e.target.value }))} className="rounded-xl border-slate-200 bg-white font-semibold" /></Field>
                      <Field label="Permit Document"><input type="file" accept="image/*,.pdf" onChange={(e) => setPermitFile(e.target.files?.[0] || null)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-[#0D3A35]/10 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-[#0D3A35]" /></Field>
                    </>}
                  </div>
                </div>

                <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/40 p-4">
                  <div><p className="text-sm font-bold text-slate-800">Operational Assignment</p><p className="text-xs font-medium text-slate-500">Link the vehicle to operations, costing, and responsible employees.</p></div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <Field label="Assigned Company"><Input value={addVehicleForm.assigned_company} onChange={(e) => setAddVehicleForm((prev) => ({ ...prev, assigned_company: e.target.value }))} className="rounded-xl border-slate-200 bg-white font-semibold" /></Field>
                    <Field label="Project"><SelectField value={addVehicleForm.project} onChange={(v) => { const project = accountingDimensions.projects.find((item: any) => item.name === v); setAddVehicleForm((prev) => ({ ...prev, project: v, cluster_location: project?.location || prev.cluster_location })); }} placeholder={accountingDimensions.projects.length ? 'Select project' : 'No projects configured'} options={accountingDimensions.projects.map((item: any) => ({ value: item.name, label: `${item.code} · ${item.name}` }))} /></Field>
                    <Field label="Cluster / Location"><Input value={addVehicleForm.cluster_location} onChange={(e) => setAddVehicleForm((prev) => ({ ...prev, cluster_location: e.target.value }))} className="rounded-xl border-slate-200 bg-white font-semibold" placeholder="Khairagarh" /></Field>
                    <Field label="Assigned Department"><SelectField value={addVehicleForm.assigned_department} onChange={(v) => setAddVehicleForm((prev) => ({ ...prev, assigned_department: v }))} placeholder={accountingDimensions.departments.length ? 'Select department' : 'No departments configured'} options={accountingDimensions.departments.map((item: any) => ({ value: item.name, label: `${item.code} · ${item.name}` }))} /></Field>
                    <Field label="Cost Centre"><SelectField value={addVehicleForm.cost_centre} onChange={(v) => setAddVehicleForm((prev) => ({ ...prev, cost_centre: v }))} placeholder={accountingDimensions.costCentres.length ? 'Select cost centre' : 'No cost centres configured'} options={accountingDimensions.costCentres.map((item: any) => ({ value: item.name, label: `${item.code} · ${item.name}` }))} /></Field>
                    <Field label="Cost Attribution"><SelectField value={addVehicleForm.cost_attribution} onChange={(v) => setAddVehicleForm((prev) => ({ ...prev, cost_attribution: v }))} placeholder={accountingDimensions.costAttributions.length ? 'Select cost attribution' : 'No cost attributions configured'} options={accountingDimensions.costAttributions.map((item: any) => ({ value: item.name, label: `${item.code} · ${item.name}${item.level ? ` · ${item.level}` : ''}` }))} /></Field>
                    <Field label={['Tractor', 'JCB', 'Harvester'].includes(addVehicleForm.type) ? 'Primary Driver / Operator' : 'Primary Driver'}><SelectField value={addVehicleForm.primary_driver_id} onChange={(v) => setAddVehicleForm((prev) => ({ ...prev, primary_driver_id: v }))} disabled={isLoadingStaff} placeholder={isLoadingStaff ? 'Loading employees…' : 'Select employee'} options={staffOptions.map((staff) => ({ value: staff.id, label: staff.name }))} /></Field>
                    <Field label="Reporting Manager"><SelectField value={addVehicleForm.reporting_manager_id} onChange={(v) => setAddVehicleForm((prev) => ({ ...prev, reporting_manager_id: v }))} disabled={isLoadingStaff} placeholder="Select manager" options={staffOptions.map((staff) => ({ value: staff.id, label: staff.name }))} /></Field>
                    <Field label={`Current ${addVehicleForm.meter_unit === 'Hours' ? 'Hour Meter' : 'Odometer'}`}><Input type="number" min="0" value={addVehicleForm.current_meter_reading} onChange={(e) => setAddVehicleForm((prev) => ({ ...prev, current_meter_reading: e.target.value }))} className="rounded-xl border-slate-200 bg-white font-semibold" placeholder={addVehicleForm.meter_unit === 'Hours' ? 'Running hours' : 'Kilometres'} /></Field>
                    <Field label="Assignment Status"><SelectField value={addVehicleForm.assignment_status} onChange={(v) => setAddVehicleForm((prev) => ({ ...prev, assignment_status: v }))} placeholder="Select status" options={['Assigned', 'Pool', 'Unassigned'].map((value) => ({ value, label: value }))} /></Field>
                  </div>
                </div>

                <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/40 p-4">
                  <div>
                    <p className="text-sm font-bold text-slate-800">Servicing & Maintenance</p>
                    <p className="text-xs font-medium text-slate-500">Who's responsible for keeping this vehicle serviced.</p>
                  </div>

                  <div className="flex max-w-xs items-center gap-1 rounded-xl border border-slate-200 bg-white p-1">
                    <button
                      type="button"
                      onClick={() => setAddVehicleForm((prev) => ({ ...prev, servicing_responsibility: 'vendor' }))}
                      className={cn(
                        'flex-1 rounded-lg px-3 py-2 text-sm font-bold transition-colors',
                        addVehicleForm.servicing_responsibility === 'vendor' ? 'bg-[#0D3A35] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'
                      )}
                    >
                      Vendor
                    </button>
                    <button
                      type="button"
                      onClick={() => setAddVehicleForm((prev) => ({ ...prev, servicing_responsibility: 'SBR' }))}
                      className={cn(
                        'flex-1 rounded-lg px-3 py-2 text-sm font-bold transition-colors',
                        addVehicleForm.servicing_responsibility === 'SBR' ? 'bg-[#0D3A35] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'
                      )}
                    >
                      SBR
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <Field label="Fuel Tank Capacity (L)"><Input type="number" min="0" value={addVehicleForm.fuel_tank_capacity} onChange={(e) => setAddVehicleForm((prev) => ({ ...prev, fuel_tank_capacity: e.target.value }))} className="rounded-xl border-slate-200 bg-white font-semibold" /></Field>
                    <Field label="Expected Mileage / Consumption"><Input value={addVehicleForm.expected_consumption} onChange={(e) => setAddVehicleForm((prev) => ({ ...prev, expected_consumption: e.target.value }))} className="rounded-xl border-slate-200 bg-white font-semibold" placeholder="12 KM/L or 8 L/Hour" /></Field>
                    <Field label="Fuel Card / Tag No."><Input value={addVehicleForm.fuel_card_tag_no} onChange={(e) => setAddVehicleForm((prev) => ({ ...prev, fuel_card_tag_no: e.target.value }))} className="rounded-xl border-slate-200 bg-white font-semibold" /></Field>
                    <Field label={`Service Interval (${addVehicleForm.service_interval_unit})`}><Input type="number" min="0" value={addVehicleForm.service_interval} onChange={(e) => setAddVehicleForm((prev) => ({ ...prev, service_interval: e.target.value }))} className="rounded-xl border-slate-200 bg-white font-semibold" /></Field>
                    <Field label="Last Service Reading"><Input type="number" min="0" value={addVehicleForm.last_service_reading} onChange={(e) => setAddVehicleForm((prev) => ({ ...prev, last_service_reading: e.target.value }))} className="rounded-xl border-slate-200 bg-white font-semibold" /></Field>
                    <Field label="Next Service Due"><Input type="number" min="0" value={addVehicleForm.next_service_due} onChange={(e) => setAddVehicleForm((prev) => ({ ...prev, next_service_due: e.target.value }))} className="rounded-xl border-slate-200 bg-white font-semibold" /></Field>
                    <Field label="Vehicle Status"><SelectField value={addVehicleForm.vehicle_status} onChange={(v) => setAddVehicleForm((prev) => ({ ...prev, vehicle_status: v }))} placeholder="Select status" options={['Active', 'Under Maintenance', 'Out of Service', 'Contract Expired', 'Sold/Disposed', 'Inactive'].map((value) => ({ value, label: value }))} /></Field>
                  </div>

                  {addVehicleForm.servicing_responsibility === 'SBR' && (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <Field label="Last Servicing Date" required>
                        <Input
                          type="date"
                          value={addVehicleForm.last_service_date}
                          onChange={(e) => setAddVehicleForm((prev) => ({ ...prev, last_service_date: e.target.value }))}
                          className="rounded-xl border-slate-200 bg-white font-semibold"
                        />
                      </Field>
                      <Field label={`Last Servicing ${addVehicleForm.meter_unit === 'Hours' ? 'Hours' : 'KM'}`}>
                        <Input
                          type="number"
                          min="0"
                          value={addVehicleForm.last_service_km}
                          onChange={(e) => setAddVehicleForm((prev) => ({ ...prev, last_service_km: e.target.value }))}
                          placeholder="e.g. 42500"
                          className="rounded-xl border-slate-200 bg-white font-semibold"
                        />
                      </Field>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          <DialogFooter className="border-t border-slate-100 bg-slate-50/70 px-6 py-4">
            <Button variant="outline" className="rounded-xl font-bold" onClick={handleCloseAddModal}>
              Cancel
            </Button>

            {addVehicleStep === 2 && (
              <Button variant="outline" className="rounded-xl font-bold" onClick={() => setAddVehicleStep(1)}>
                Back
              </Button>
            )}

            {addVehicleStep === 1 ? (
              <Button className="rounded-xl bg-[#0D3A35] font-bold text-white hover:bg-[#092e2a]" onClick={handleNextVehicleStep}>
                Next
              </Button>
            ) : (
              <Button
                disabled={isSubmittingAddVehicle}
                className="rounded-xl bg-[#0D3A35] font-bold text-white hover:bg-[#092e2a]"
                onClick={submitAddVehicle}
              >
                {isSubmittingAddVehicle ? (editingVehicleId ? 'Saving…' : 'Adding…') : (editingVehicleId ? 'Save Changes' : 'Add Vehicle')}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default VehicleManagement;
