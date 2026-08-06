import { useEffect, useMemo, useState } from 'react';
import {
  Plus, Upload, Search, ChevronDown,
  Truck, Wrench, CheckCircle2, Car, CalendarDays, FileText, Fuel, UserRound, ShieldCheck
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
import { Separator } from '@/components/ui/separator';

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
  vehicleType: 'Truck' | 'Tractor' | 'Trolley' | 'Tipper' | 'Pickup' | 'Car' | 'Harvester' | 'Other';
  make: string;
  model: string;
  status: 'Active' | 'In Service';
  lastServiceDate?: string;
  assignedStaff: any[];
  fuelLogs: any[];
  serviceHistory: any[];
  workCalendar: any[];
}

type ApiVehicle = {
  vehicle_id: string;
  created_at?: string;
  vehicle_information: {
    vehicle_number: string;
    owned_by: string;
    company: string;
    model: string;
    type: string;
    last_service_date: string;
  };
  assigned_staff: any[] | Record<string, any> | null;
  servise_history: any[];
  fuel_logs: any[];
  work_calandar: any[];
};

const VehicleManagement = () => {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
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

  const [vendorOptions, setVendorOptions] = useState<Array<{ vendor_id: string; vendor_name: string }>>([]);
  const [isLoadingVendors, setIsLoadingVendors] = useState(false);
  const [vendorOrders, setVendorOrders] = useState<Array<{ flow_id: string; order_number: string; order_type: string; status: string }>>([]);
  const [isLoadingVendorOrders, setIsLoadingVendorOrders] = useState(false);

  const baseUrl = useMemo(() => getBaseUrl().replace(/\/$/, ''), []);

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
      location: entry?.location || entry?.place || entry?.site || '',
      distanceTraveled: entry?.distance_traveled ?? entry?.distance ?? entry?.kms ?? '',
      activityType: entry?.activity_type || entry?.activity || entry?.type || '',
      totalArea: entry?.total_area ?? entry?.area ?? '',
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
          status: 'Active',
          lastServiceDate: info?.last_service_date,
          assignedStaff: normalizeAssignedStaff(v.assigned_staff),
          fuelLogs: Array.isArray(v.fuel_logs) ? v.fuel_logs : [],
          serviceHistory: Array.isArray(v.servise_history) ? v.servise_history : [],
          workCalendar: Array.isArray(v.work_calandar) ? v.work_calandar : [],
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
    inService: vehicles.filter(v => v.status === 'In Service').length,
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
      const [insuranceDocKey, permitDocKey, pollutionDocKey] = await Promise.all([
        insuranceFile ? uploadDocument(insuranceFile) : Promise.resolve(''),
        permitFile ? uploadDocument(permitFile) : Promise.resolve(''),
        pollutionFile ? uploadDocument(pollutionFile) : Promise.resolve(''),
      ]);

      const payload = {
        vehicle_information: {
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
          servicing_responsibility: addVehicleForm.servicing_responsibility,
          last_service_km: addVehicleForm.last_service_km ? Number(addVehicleForm.last_service_km) : undefined,
        },
        assigned_staff: [],
        servise_history: [],
        fuel_logs: [],
        work_calandar: [],
      };

      const response = await fetch(`${baseUrl}/admin_vehicles/add_vehicle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
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
        toast.error(data?.message || 'Failed to add vehicle');
        return;
      }

      if (data?.status !== 'success') {
        toast.error(data?.message || 'Failed to add vehicle');
        return;
      }

      toast.success('Vehicle onboarded successfully');
      setIsAddModalOpen(false);
      setAddVehicleStep(1);
      resetAddVehicleForm();
      fetchVehicles();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to add vehicle');
    } finally {
      setIsSubmittingAddVehicle(false);
    }
  };

  const handleCloseAddModal = () => {
    setIsAddModalOpen(false);
    setAddVehicleStep(1);
    resetAddVehicleForm();
  };

  const handleOpenAddModal = () => {
    setAddVehicleStep(1);
    setIsAddModalOpen(true);
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
    setAddVehicleStep(2);
  };

  const toggleServiceStatus = (id: string) => {
    setVehicles(prev => prev.map(v => {
      if (v.id === id) {
        const newStatus = v.status === 'Active' ? 'In Service' : 'Active';
        toast.info(newStatus === 'In Service' ? `Vehicle sent for servicing` : `Vehicle marked as active`);
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

        {/* Table */}
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_14px_40px_rgba(15,23,42,0.05)]">
          {isLoadingVehicles ? (
            <div className="p-6 text-sm font-medium text-slate-500">Loading vehicles…</div>
          ) : filteredVehicles.length === 0 ? (
            <div className="p-6 text-sm font-medium text-slate-500">No vehicles found.</div>
          ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-white/10 bg-[#0D3A35] text-white">
                <th className="px-6 py-4 text-left font-bold">Registration No</th>
                <th className="px-6 py-4 text-left font-bold">Type</th>
                <th className="px-6 py-4 text-left font-bold">Make / Model</th>
                <th className="px-6 py-4 text-left font-bold">Ownership</th>
                <th className="px-6 py-4 text-left font-bold">Status</th>
                <th className="px-6 py-4 text-right font-bold">Vehicle Calendar</th>
                <th className="px-6 py-4 text-right font-bold">Service Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredVehicles.map((vehicle) => (
                <>
                  <tr key={vehicle.id} className="hover:bg-slate-50/70">
                    <td className="px-6 py-4 font-bold text-slate-900">
                      {vehicle.registrationNo}
                    </td>
                    <td className="px-6 py-4 font-medium text-slate-700">{vehicle.vehicleType}</td>
                    <td className="px-6 py-4 font-medium text-slate-500">{vehicle.make} {vehicle.model}</td>
                    <td className="px-6 py-4">
                      <Badge
                        variant="outline"
                        className={cn(
                          'rounded-full border px-2.5 py-1 text-[10px] font-bold',
                          vehicle.ownerType === 'Owned' ? 'border-[#0D3A35]/20 bg-[#0D3A35]/5 text-[#0D3A35]' : 'border-slate-200 bg-slate-50 text-slate-600'
                        )}
                      >
                        {vehicle.ownedByRaw || vehicle.ownerType}
                      </Badge>
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        'flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold',
                        vehicle.status === 'Active' ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'
                      )}>
                        <span className={cn('h-1.5 w-1.5 rounded-full', vehicle.status === 'Active' ? 'bg-emerald-600' : 'bg-orange-600')} />
                        {vehicle.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCalendarVehicle(vehicle)}
                        className="gap-2 rounded-lg border-[#0D3A35]/15 font-bold text-[#0D3A35] hover:bg-[#0D3A35]/5"
                      >
                        <CalendarDays className="h-4 w-4" />
                        Calendar
                      </Button>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {vehicle.status === 'Active' ? (
                        <button
                          onClick={() => toggleServiceStatus(vehicle.id)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-bold text-orange-700 transition-colors hover:bg-orange-100"
                          title="Send to Service Center"
                        >
                          <Wrench className="w-3.5 h-3.5" />
                          Service
                        </button>
                      ) : (
                        <button
                          onClick={() => toggleServiceStatus(vehicle.id)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 transition-colors hover:bg-emerald-100"
                          title="Mark as Back from Service"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Complete
                        </button>
                      )}
                    </td>
                  </tr>

                  <tr className="bg-slate-50/60">
                    <td colSpan={7} className="px-6 py-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="inline-flex items-center gap-2 text-sm">
                          <UserRound className="h-4 w-4 text-slate-400" />
                          <span className="font-medium text-slate-500">Assigned to:</span>
                          <span className="font-bold text-slate-800">{getAssignedStaffName(vehicle.assignedStaff)}</span>
                          <button
                            type="button"
                            onClick={async () => {
                              setAssignVehicle(vehicle);
                              setSelectedStaffId(getAssignedStaffId(vehicle.assignedStaff));
                              await fetchStaffOptions();
                            }}
                            className="text-sm font-bold text-[#0D3A35] hover:underline"
                          >
                            Edit
                          </button>
                        </div>

                        <Separator orientation="vertical" className="h-4" />

                        <button
                          type="button"
                          onClick={() => setFuelLogsVehicle(vehicle)}
                          className="inline-flex items-center gap-2 text-sm font-bold text-slate-700 hover:text-[#0D3A35]"
                        >
                          <Fuel className="h-4 w-4 text-slate-400" />
                          View fuel logs
                        </button>

                        <Separator orientation="vertical" className="h-4" />

                        <button
                          type="button"
                          onClick={() => setPapersVehicle(vehicle)}
                          className="inline-flex items-center gap-2 text-sm font-bold text-slate-700 hover:text-[#0D3A35]"
                        >
                          <FileText className="h-4 w-4 text-slate-400" />
                          View vehicle papers
                        </button>

                        <Separator orientation="vertical" className="h-4" />

                        <button
                          type="button"
                          onClick={() => setServiceLogsVehicle(vehicle)}
                          className="inline-flex items-center gap-2 text-sm font-bold text-slate-700 hover:text-[#0D3A35]"
                        >
                          <Wrench className="h-4 w-4 text-slate-400" />
                          Servicing logs
                        </button>
                      </div>
                    </td>
                  </tr>
                </>
              ))}
            </tbody>
          </table>
          </div>
          )}
        </div>
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
                              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">Location</th>
                              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">Distance traveled</th>
                              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">Activity type</th>
                              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">Total area</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {(byMonth[m.key] ?? []).length === 0 ? (
                              <tr>
                                <td colSpan={4} className="px-4 py-6 text-center font-medium text-slate-400">No entries for this month.</td>
                              </tr>
                            ) : (
                              (byMonth[m.key] ?? []).map((e, idx) => (
                                <tr key={idx} className="hover:bg-slate-50/70">
                                  <td className="px-4 py-3 font-medium text-slate-700">{e.location || '-'}</td>
                                  <td className="px-4 py-3 font-medium text-slate-700">{e.distanceTraveled !== '' ? e.distanceTraveled : '-'}</td>
                                  <td className="px-4 py-3 font-medium text-slate-700">{e.activityType || '-'}</td>
                                  <td className="px-4 py-3 font-medium text-slate-700">{e.totalArea !== '' ? e.totalArea : '-'}</td>
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
        <DialogContent className="max-w-lg rounded-2xl border-0 p-0 max-h-[90vh] overflow-y-auto">
          <DialogHeader className="bg-[#0D3A35] px-6 py-5 text-white">
            <DialogTitle className="flex items-center gap-2 text-lg font-bold text-white">
              <Plus className="h-5 w-5" />
              Add New Vehicle
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
                  <div className="grid grid-cols-2 gap-4">
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
                  <Field label="Company">
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

                <Field label="Type">
                  <SelectField
                    value={addVehicleForm.type}
                    onChange={(v) => setAddVehicleForm((prev) => ({ ...prev, type: v }))}
                    placeholder="Select type"
                    options={['Tractor', 'Tipper', 'Harvester', 'Truck', 'Pickup', 'Car', 'Other'].map((t) => ({ value: t, label: t }))}
                  />
                </Field>
              </>
            ) : (
              <>
                <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/40 p-4">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-[#0D3A35]" />
                    <div>
                      <p className="text-sm font-bold text-slate-800">Compliance Documents</p>
                      <p className="text-xs font-medium text-slate-500">Validity dates and papers for insurance, permit, and pollution certificate.</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label="Insurance Validity">
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

                    <Field label="Permit Validity">
                      <Input
                        type="date"
                        value={addVehicleForm.permit_validity}
                        onChange={(e) => setAddVehicleForm((prev) => ({ ...prev, permit_validity: e.target.value }))}
                        className="rounded-xl border-slate-200 bg-white font-semibold"
                      />
                    </Field>
                    <Field label="Permit Document">
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        onChange={(e) => setPermitFile(e.target.files?.[0] || null)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-[#0D3A35]/10 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-[#0D3A35] hover:file:bg-[#0D3A35]/15"
                      />
                    </Field>

                    <Field label="Pollution Certificate Validity">
                      <Input
                        type="date"
                        value={addVehicleForm.pollution_cert_validity}
                        onChange={(e) => setAddVehicleForm((prev) => ({ ...prev, pollution_cert_validity: e.target.value }))}
                        className="rounded-xl border-slate-200 bg-white font-semibold"
                      />
                    </Field>
                    <Field label="Pollution Certificate Document">
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        onChange={(e) => setPollutionFile(e.target.files?.[0] || null)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-[#0D3A35]/10 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-[#0D3A35] hover:file:bg-[#0D3A35]/15"
                      />
                    </Field>
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
                      <Field label="Last Servicing KM">
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
                {isSubmittingAddVehicle ? 'Adding…' : 'Add Vehicle'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default VehicleManagement;