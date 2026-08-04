import { useEffect, useMemo, useState } from 'react';
import { 
  Plus, Upload, Search, Filter, X, 
  Truck, Wrench, CheckCircle2, Car, CalendarDays, FileText, Fuel, UserRound
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { getBaseUrl } from '@/lib/config';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { formatDateDDMMYYYY } from '@/lib/dateFormat';

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
    vehicle_number: '',
    owned_by: 'SBR',
    company: '',
    model: '',
    type: 'Tractor',
    last_service_date: '',
  });

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
    return (
      first?.staff_information?.name ||
      first?.staff_information?.full_name ||
      first?.staff_information?.staff_name ||
      first?.name ||
      first?.full_name ||
      first?.staff_name ||
      first?.staff_id ||
      'Unassigned'
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

  const resetAddVehicleForm = () => {
    setAddVehicleForm({
      vehicle_number: '',
      owned_by: 'SBR',
      company: '',
      model: '',
      type: 'Tractor',
      last_service_date: '',
    });
  };

  const submitAddVehicle = async () => {
    if (!addVehicleForm.vehicle_number.trim()) {
      toast.error('Vehicle number is required');
      setAddVehicleStep(1);
      return;
    }

    if (!addVehicleForm.last_service_date) {
      toast.error('Last servicing date is required');
      setAddVehicleStep(2);
      return;
    }

    setIsSubmittingAddVehicle(true);
    try {
      const payload = {
        vehicle_information: {
          vehicle_number: addVehicleForm.vehicle_number.trim(),
          owned_by: addVehicleForm.owned_by,
          company: addVehicleForm.company,
          model: addVehicleForm.model,
          type: addVehicleForm.type,
          last_service_date: addVehicleForm.last_service_date,
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
    <div className="p-8 space-y-8 animate-in fade-in duration-300 relative">
      
      {/* --- HEADER --- */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Vehicle Management</h1>
          <p className="text-muted-foreground mt-1">Onboard fleet, track maintenance, and manage ownership.</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={handleBulkUpload}
            className="flex items-center gap-2 border border-border bg-white text-foreground px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            <Upload className="w-4 h-4" />
            Bulk Upload
          </button>
          <button 
            onClick={handleOpenAddModal}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Add Vehicle
          </button>
        </div>
      </div>

      {/* --- STATS --- */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card border border-border p-4 rounded-xl shadow-sm flex items-center justify-between">
          <div><p className="text-xs text-muted-foreground uppercase font-bold">Total Fleet</p><h3 className="text-2xl font-bold">{stats.total}</h3></div>
          <div className="p-2 bg-gray-100 rounded-lg"><Car className="w-5 h-5 text-gray-600"/></div>
        </div>
        <div className="bg-card border border-border p-4 rounded-xl shadow-sm flex items-center justify-between">
          <div><p className="text-xs text-muted-foreground uppercase font-bold">Active / On Road</p><h3 className="text-2xl font-bold text-green-600">{stats.active}</h3></div>
          <div className="p-2 bg-green-50 rounded-lg"><Truck className="w-5 h-5 text-green-600"/></div>
        </div>
        <div className="bg-card border border-border p-4 rounded-xl shadow-sm flex items-center justify-between">
          <div><p className="text-xs text-muted-foreground uppercase font-bold">In Service</p><h3 className="text-2xl font-bold text-orange-600">{stats.inService}</h3></div>
          <div className="p-2 bg-orange-50 rounded-lg"><Wrench className="w-5 h-5 text-orange-600"/></div>
        </div>
      </div>

      {/* --- LIST VIEW --- */}
      <div className="space-y-4">
        {/* Search */}
        <div className="flex gap-4 items-center bg-card border border-border p-3 rounded-lg shadow-sm">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search Registration No or Make..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-2 w-full text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 bg-background"
            />
          </div>
          <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground px-3 py-2 rounded-md hover:bg-muted transition-colors">
            <Filter className="w-4 h-4" />
            Filter
          </button>
        </div>

        {/* Table */}
        <div className="bg-white border border-border rounded-xl overflow-hidden shadow-sm">
          {isLoadingVehicles ? (
            <div className="p-6 text-sm text-muted-foreground">Loading vehicles…</div>
          ) : filteredVehicles.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">No vehicles found.</div>
          ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-6 py-4 text-left font-semibold text-muted-foreground">Registration No</th>
                <th className="px-6 py-4 text-left font-semibold text-muted-foreground">Type</th>
                <th className="px-6 py-4 text-left font-semibold text-muted-foreground">Make / Model</th>
                <th className="px-6 py-4 text-left font-semibold text-muted-foreground">Ownership</th>
                <th className="px-6 py-4 text-left font-semibold text-muted-foreground">Status</th>
                <th className="px-6 py-4 text-right font-semibold text-muted-foreground">Vehicle Calendar</th>
                <th className="px-6 py-4 text-right font-semibold text-muted-foreground">Service Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredVehicles.map((vehicle) => (
                <>
                  <tr key={vehicle.id} className="hover:bg-muted/20">
                    <td className="px-6 py-4 font-medium text-foreground">
                      {vehicle.registrationNo}
                    </td>
                    <td className="px-6 py-4">{vehicle.vehicleType}</td>
                    <td className="px-6 py-4 text-muted-foreground">{vehicle.make} {vehicle.model}</td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "px-2 py-0.5 rounded-full text-xs border",
                        vehicle.ownerType === 'Owned' ? "bg-purple-50 border-purple-200 text-purple-700" : "bg-gray-50 border-gray-200 text-gray-700"
                      )}>
                        {vehicle.ownedByRaw || vehicle.ownerType}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1.5 w-fit",
                        vehicle.status === 'Active' ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"
                      )}>
                        <span className={cn("w-1.5 h-1.5 rounded-full", vehicle.status === 'Active' ? "bg-green-600" : "bg-orange-600")} />
                        {vehicle.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCalendarVehicle(vehicle)}
                        className="gap-2"
                      >
                        <CalendarDays className="h-4 w-4" />
                        Calendar
                      </Button>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {vehicle.status === 'Active' ? (
                        <button 
                          onClick={() => toggleServiceStatus(vehicle.id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-orange-50 text-orange-700 hover:bg-orange-100 border border-orange-200 transition-colors"
                          title="Send to Service Center"
                        >
                          <Wrench className="w-3.5 h-3.5" />
                          Service
                        </button>
                      ) : (
                        <button 
                          onClick={() => toggleServiceStatus(vehicle.id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 transition-colors"
                          title="Mark as Back from Service"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Complete
                        </button>
                      )}
                    </td>
                  </tr>

                  <tr className="bg-muted/10">
                    <td colSpan={7} className="px-6 py-3">
                      <div className="flex flex-col gap-2">
                        <div className="flex flex-wrap items-center gap-3">
                          <div className="inline-flex items-center gap-2 text-sm">
                            <UserRound className="h-4 w-4 text-muted-foreground" />
                            <span className="text-muted-foreground">Assigned to:</span>
                            <span className="font-medium text-foreground">{getAssignedStaffName(vehicle.assignedStaff)}</span>
                            <button
                              type="button"
                              onClick={async () => {
                                setAssignVehicle(vehicle);
                                setSelectedStaffId(getAssignedStaffId(vehicle.assignedStaff));
                                await fetchStaffOptions();
                              }}
                              className="text-sm font-medium text-primary hover:underline"
                            >
                              Edit
                            </button>
                          </div>

                          <Separator orientation="vertical" className="h-4" />

                          <button
                            type="button"
                            onClick={() => setFuelLogsVehicle(vehicle)}
                            className="inline-flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary"
                          >
                            <Fuel className="h-4 w-4 text-muted-foreground" />
                            View fuel logs
                          </button>

                          <Separator orientation="vertical" className="h-4" />

                          <button
                            type="button"
                            onClick={() => setPapersVehicle(vehicle)}
                            className="inline-flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary"
                          >
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            View vehicle papers
                          </button>

                          <Separator orientation="vertical" className="h-4" />

                          <button
                            type="button"
                            onClick={() => setServiceLogsVehicle(vehicle)}
                            className="inline-flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary"
                          >
                            <Wrench className="h-4 w-4 text-muted-foreground" />
                            Servicing logs
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                </>
              ))}
            </tbody>
          </table>
          )}
        </div>
      </div>

      {/* Fuel Logs Dialog */}
      <Dialog open={!!fuelLogsVehicle} onOpenChange={(open) => !open && setFuelLogsVehicle(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Fuel Logs</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground">
            {fuelLogsVehicle?.registrationNo} • {fuelLogsVehicle?.make} {fuelLogsVehicle?.model}
          </div>
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="bg-muted/40 px-4 py-3 text-sm font-medium">Entries</div>
            <ScrollArea className="max-h-[420px]">
              <table className="w-full text-sm">
                <thead className="bg-background border-b border-border sticky top-0">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Date</th>
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Volume</th>
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Type</th>
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Amount (Rs)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(fuelLogsVehicle?.fuelLogs ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">No fuel logs available.</td>
                    </tr>
                  ) : (
                    (fuelLogsVehicle?.fuelLogs ?? []).map((log, idx) => {
                      const row = normalizeFuelLog(log);
                      return (
                        <tr key={idx} className="hover:bg-muted/20">
                          <td className="px-4 py-3">{row.date || '-'}</td>
                          <td className="px-4 py-3">{row.volume !== '' ? row.volume : '-'}</td>
                          <td className="px-4 py-3">{row.type || '-'}</td>
                          <td className="px-4 py-3">{row.amount !== '' ? row.amount : '-'}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>

      {/* Vehicle Papers Dialog */}
      <Dialog open={!!papersVehicle} onOpenChange={(open) => !open && setPapersVehicle(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Vehicle Papers</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground">
            {papersVehicle?.registrationNo} • {papersVehicle?.make} {papersVehicle?.model}
          </div>
          <div className="border border-border rounded-lg p-4 bg-muted/10">
            <div className="text-sm font-medium text-foreground">Documents</div>
            <div className="text-sm text-muted-foreground mt-1">
              No papers available from the backend response yet.
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Servicing Logs Dialog */}
      <Dialog open={!!serviceLogsVehicle} onOpenChange={(open) => !open && setServiceLogsVehicle(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Servicing Logs</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="border border-border rounded-lg p-4 bg-muted/10">
              <div className="text-sm font-medium text-foreground">Last servicing date</div>
              <div className="text-sm text-muted-foreground mt-1">{serviceLogsVehicle?.lastServiceDate || '-'}</div>
            </div>
            <div className="border border-border rounded-lg p-4 bg-muted/10">
              <div className="text-sm font-medium text-foreground">Assigned to</div>
              <div className="text-sm text-muted-foreground mt-1">{getAssignedStaffName(serviceLogsVehicle?.assignedStaff ?? [])}</div>
            </div>
          </div>
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="bg-muted/40 px-4 py-3 text-sm font-medium">Service history</div>
            <ScrollArea className="max-h-[360px]">
              {(serviceLogsVehicle?.serviceHistory ?? []).length === 0 ? (
                <div className="p-6 text-sm text-muted-foreground">No service history available.</div>
              ) : (
                <div className="p-4 space-y-2">
                  {(serviceLogsVehicle?.serviceHistory ?? []).map((item, idx) => (
                    <div key={idx} className="border border-border rounded-lg p-3 bg-background">
                      <div className="text-sm text-foreground">{formatDateDDMMYYYY(item?.date || item?.created_at, `Entry ${idx + 1}`)}</div>
                      <div className="text-xs text-muted-foreground mt-1 break-words">{typeof item === 'string' ? item : JSON.stringify(item)}</div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>

      {/* Vehicle Calendar Dialog */}
      <Dialog open={!!calendarVehicle} onOpenChange={(open) => !open && setCalendarVehicle(null)}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Vehicle Calendar (6 months)</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground">
            {calendarVehicle?.registrationNo} • {calendarVehicle?.make} {calendarVehicle?.model}
          </div>

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
                    <div className="border border-border rounded-lg overflow-hidden">
                      <div className="bg-muted/40 px-4 py-3 text-sm font-medium">Work entries</div>
                      <ScrollArea className="max-h-[420px]">
                        <table className="w-full text-sm">
                          <thead className="bg-background border-b border-border sticky top-0">
                            <tr>
                              <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Location</th>
                              <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Distance traveled</th>
                              <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Activity type</th>
                              <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Total area</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {(byMonth[m.key] ?? []).length === 0 ? (
                              <tr>
                                <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">No entries for this month.</td>
                              </tr>
                            ) : (
                              (byMonth[m.key] ?? []).map((e, idx) => (
                                <tr key={idx} className="hover:bg-muted/20">
                                  <td className="px-4 py-3">{e.location || '-'}</td>
                                  <td className="px-4 py-3">{e.distanceTraveled !== '' ? e.distanceTraveled : '-'}</td>
                                  <td className="px-4 py-3">{e.activityType || '-'}</td>
                                  <td className="px-4 py-3">{e.totalArea !== '' ? e.totalArea : '-'}</td>
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
        </DialogContent>
      </Dialog>

      {/* Assign Driver Dialog */}
      <Dialog open={!!assignVehicle} onOpenChange={(open) => !open && setAssignVehicle(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Assign Driver</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground">
            {assignVehicle?.registrationNo} • Current: {getAssignedStaffName(assignVehicle?.assignedStaff ?? [])}
          </div>
          <div className="space-y-3">
            <div className="text-sm font-medium">Select staff</div>
            <select
              value={selectedStaffId}
              onChange={(e) => setSelectedStaffId(e.target.value)}
              className="w-full px-3 py-2.5 border border-input rounded-lg text-sm bg-background"
              disabled={isLoadingStaff}
            >
              <option value="">Select driver</option>
              {staffOptions.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>

            <div className="border border-border rounded-lg p-4 bg-muted/10">
              {(() => {
                if (!selectedStaffId) {
                  return <div className="text-sm text-muted-foreground">Select a staff member to view details.</div>;
                }

                const selected = staffList.find((s) => (s?.staff_id || s?.id) === selectedStaffId);
                const info = selected?.staff_information;
                const name = info?.staff_name || info?.name || info?.full_name || selected?.name || selected?.full_name || selectedStaffId;
                const phone = info?.staff_phone || selected?.staff_phone || '-';
                const department = info?.staff_department || selected?.staff_department || '-';
                const designation = info?.staff_designation || selected?.staff_designation || '-';
                const employmentType = info?.employment_type || selected?.employment_type || '-';

                return (
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-foreground">{name}</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                      <div className="rounded-md border border-border bg-background px-3 py-2">
                        <div className="text-xs text-muted-foreground">Phone</div>
                        <div className="font-medium text-foreground mt-0.5">{phone}</div>
                      </div>
                      <div className="rounded-md border border-border bg-background px-3 py-2">
                        <div className="text-xs text-muted-foreground">Employment</div>
                        <div className="font-medium text-foreground mt-0.5">{employmentType}</div>
                      </div>
                      <div className="rounded-md border border-border bg-background px-3 py-2">
                        <div className="text-xs text-muted-foreground">Department</div>
                        <div className="font-medium text-foreground mt-0.5">{department}</div>
                      </div>
                      <div className="rounded-md border border-border bg-background px-3 py-2">
                        <div className="text-xs text-muted-foreground">Designation</div>
                        <div className="font-medium text-foreground mt-0.5">{designation}</div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAssignVehicle(null)}>Cancel</Button>
            <Button
              disabled={isSubmittingAssignment}
              onClick={() => {
                (async () => {
                  if (!assignVehicle) return;
                  if (!selectedStaffId) {
                    toast.error('Please select a driver');
                    return;
                  }

                  const selected = staffList.find((s) => (s?.staff_id || s?.id) === selectedStaffId);
                  const info = selected?.staff_information;

                  const staff_contact = info?.staff_phone || selected?.staff_phone || '';
                  const stadd_department = info?.staff_department || selected?.staff_department || '';
                  const staff_designation = info?.staff_designation || selected?.staff_designation || '';

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
          </div>
        </DialogContent>
      </Dialog>

      {/* --- ADD VEHICLE MODAL (Matching Screenshot) --- */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-background w-full max-w-lg rounded-xl shadow-lg border border-border overflow-hidden animate-in zoom-in-95 duration-200">
            
            {/* Header */}
            <div className="px-6 py-4 border-b border-border flex justify-between items-center bg-white">
              <div>
                <h3 className="font-bold text-lg text-foreground">Add New Vehicle</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Step {addVehicleStep} of 2</p>
              </div>
              <button onClick={handleCloseAddModal} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form
              id="add-vehicle-form"
              className="p-6 space-y-5"
            >
              
              {addVehicleStep === 1 ? (
                <>
                  <div className="grid grid-cols-2 gap-5">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Vehicle Number *</label>
                      <input
                        required
                        value={addVehicleForm.vehicle_number}
                        onChange={(e) => setAddVehicleForm((prev) => ({ ...prev, vehicle_number: e.target.value }))}
                        className="w-full px-3 py-2.5 border border-input rounded-lg text-sm bg-gray-50/50"
                        placeholder="MH12AB1234"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Owned By</label>
                      <select
                        value={addVehicleForm.owned_by}
                        onChange={(e) => setAddVehicleForm((prev) => ({ ...prev, owned_by: e.target.value }))}
                        className="w-full px-3 py-2.5 border border-input rounded-lg text-sm bg-white"
                      >
                        <option value="SBR">SBR</option>
                        <option value="Rented">Rented</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-5">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Company</label>
                      <input
                        value={addVehicleForm.company}
                        onChange={(e) => setAddVehicleForm((prev) => ({ ...prev, company: e.target.value }))}
                        className="w-full px-3 py-2.5 border border-input rounded-lg text-sm bg-gray-50/50"
                        placeholder="Tata, Mahindra, etc."
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Model</label>
                      <input
                        value={addVehicleForm.model}
                        onChange={(e) => setAddVehicleForm((prev) => ({ ...prev, model: e.target.value }))}
                        className="w-full px-3 py-2.5 border border-input rounded-lg text-sm bg-gray-50/50"
                        placeholder="e.g. Prima"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Type</label>
                    <select
                      value={addVehicleForm.type}
                      onChange={(e) => setAddVehicleForm((prev) => ({ ...prev, type: e.target.value }))}
                      className="w-full px-3 py-2.5 border border-input rounded-lg text-sm bg-white"
                    >
                      <option value="Tractor">Tractor</option>
                      <option value="Tipper">Tipper</option>
                      <option value="Harvester">Harvester</option>
                      <option value="Truck">Truck</option>
                      <option value="Pickup">Pickup</option>
                      <option value="Car">Car</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </>
              ) : (
                <>
                  <div className="border border-border rounded-lg p-4 bg-white space-y-4">
                    <div>
                      <p className="text-sm font-medium text-foreground">Documents (Optional)</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Upload papers and servicing details.</p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">Registration Paper</label>
                        <input
                          type="file"
                          accept="image/*,.pdf"
                          className="w-full px-3 py-2 border border-input rounded-lg text-sm bg-background file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-foreground hover:file:bg-muted/80"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">Pollution Paper</label>
                        <input
                          type="file"
                          accept="image/*,.pdf"
                          className="w-full px-3 py-2 border border-input rounded-lg text-sm bg-background file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-foreground hover:file:bg-muted/80"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">Insurance Paper</label>
                        <input
                          type="file"
                          accept="image/*,.pdf"
                          className="w-full px-3 py-2 border border-input rounded-lg text-sm bg-background file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-foreground hover:file:bg-muted/80"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">Last Servicing Date</label>
                        <input
                          type="date"
                          value={addVehicleForm.last_service_date}
                          onChange={(e) => setAddVehicleForm((prev) => ({ ...prev, last_service_date: e.target.value }))}
                          className="w-full px-3 py-2 border border-input rounded-lg text-sm bg-background"
                        />
                      </div>
                    </div>
                  </div>
                </>
              )}

              <div className="pt-4 flex justify-end gap-3">
                <button 
                  type="button" 
                  onClick={handleCloseAddModal} 
                  className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>

                {addVehicleStep === 2 && (
                  <button
                    type="button"
                    onClick={() => setAddVehicleStep(1)}
                    className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Back
                  </button>
                )}

                {addVehicleStep === 1 ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleNextVehicleStep();
                    }}
                    className="px-5 py-2.5 text-sm font-medium text-white bg-[#1e293b] rounded-lg hover:bg-[#0f172a] transition-colors"
                  >
                    Next
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={submitAddVehicle}
                    disabled={isSubmittingAddVehicle}
                    className={cn(
                      "px-5 py-2.5 text-sm font-medium text-white bg-[#1e293b] rounded-lg hover:bg-[#0f172a] transition-colors",
                      isSubmittingAddVehicle && "opacity-60 cursor-not-allowed"
                    )}
                  >
                    {isSubmittingAddVehicle ? 'Adding…' : 'Add Vehicle'}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default VehicleManagement;
