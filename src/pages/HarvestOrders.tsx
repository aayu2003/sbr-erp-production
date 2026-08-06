import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { 
  MapPin, User, Tractor, Truck, 
  CheckCircle2, Clock, Weight, FileText, Plus
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import getBaseUrl from '@/lib/config';

// --- TYPES ---
type HarvestOrderStatus = string;

type ApiVehicle = {
  vehicle_id?: string;
  vehicle_number?: string;
  driver_contact?: string;
};

type ApiHarvestOrder = {
  order_id?: string;
  created_at?: string;
  status?: HarvestOrderStatus;
  tipper_card_number?: string | null;
  trip_sheet?: unknown[];
  farm_details?: {
    farm_id?: string;
    farmer_id?: string;
    block_id?: string;
    block_name?: string;
    area?: number;
    farming_option?: string;
    farmer_name?: string;
    land_coordinated?: unknown;
  };
  vehicle_details?: {
    harvestors?: ApiVehicle[];
    tractors?: ApiVehicle[];
  };
  supervisor_details?: {
    supervisor_id?: string;
    supervisor_name?: string;
    // Backend typo in key: "suervisor_contact" (keep support for it)
    suervisor_contact?: string;
    supervisor_contact?: string;
  };
  field_manager_details?: {
    name?: string;
    field_manager_id?: string;
    contact?: string;
  };
};

type HarvestOrdersApiResponse = {
  harvest_orders?: ApiHarvestOrder[];
};

// --- MAIN COMPONENT ---
const HarvestOrders = () => {
  const [isModalOpen, setModalOpen] = useState(false);

  const [orders, setOrders] = useState<ApiHarvestOrder[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchOrders = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const base = getBaseUrl();
        const resp = await fetch(`${base.replace(/\/$/, '')}/Harvest_management/get_harvest_orders`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!resp.ok) throw new Error(`Server responded ${resp.status}`);
        const data = (await resp.json()) as HarvestOrdersApiResponse;
        const list = Array.isArray(data?.harvest_orders) ? data.harvest_orders : [];
        setOrders(list);
      } catch (e) {
        console.error('Failed to load harvest orders:', e);
        setOrders([]);
        const message = e instanceof Error ? e.message : 'Failed to load harvest orders';
        setError(message);
        toast.error(message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchOrders();
  }, []);

  // Stats for the top cards
  const stats = useMemo(() => {
    const normalized = orders.map((o) => String(o.status || '').toLowerCase());
    return {
      total_orders: orders.length,
      in_progress: normalized.filter((s) => s === 'in_progress').length,
      completed: normalized.filter((s) => s === 'completed').length,
      scheduled: normalized.filter((s) => s === 'scheduled').length,
    };
  }, [orders]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'in_progress': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'completed': return 'bg-green-100 text-green-700 border-green-200';
      case 'scheduled': return 'bg-orange-100 text-orange-700 border-orange-200';
      case 'created': return 'bg-gray-100 text-gray-700 border-gray-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const handleViewTripSheet = (orderId: string) => {
    toast.info(`Opening trip sheet for ${orderId}`);
  };

  const formatCreatedAt = (createdAt?: string) => {
    if (!createdAt) return '—';
    const dt = new Date(createdAt);
    if (Number.isNaN(dt.getTime())) return createdAt;
    return format(dt, 'dd-MM-yyyy, hh:mm a');
  };

  return (
    <div className="p-8 space-y-6 animate-in fade-in duration-300">
      
      {/* --- HEADER --- */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Harvest Orders</h1>
          <p className="text-muted-foreground mt-1">
            Complete harvest order details with farm, vehicle, and supervisor information
          </p>
        </div>
        <button 
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Create Harvest Order
        </button>
      </div>

      {/* --- OVERVIEW CARDS --- */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white border border-border p-4 rounded-xl shadow-sm">
          <p className="text-xs text-muted-foreground uppercase font-semibold mb-1">Total Orders</p>
          <h3 className="text-2xl font-bold text-gray-700">{stats.total_orders}</h3>
        </div>
        <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl shadow-sm">
          <p className="text-xs text-blue-700 uppercase font-semibold mb-1">In Progress</p>
          <h3 className="text-2xl font-bold text-blue-600">{stats.in_progress}</h3>
        </div>
        <div className="bg-orange-50 border border-orange-200 p-4 rounded-xl shadow-sm">
          <p className="text-xs text-orange-700 uppercase font-semibold mb-1">Scheduled</p>
          <h3 className="text-2xl font-bold text-orange-600">{stats.scheduled}</h3>
        </div>
        <div className="bg-green-50 border border-green-200 p-4 rounded-xl shadow-sm">
          <p className="text-xs text-green-700 uppercase font-semibold mb-1">Completed</p>
          <h3 className="text-2xl font-bold text-green-600">{stats.completed}</h3>
        </div>
      </div>

      {/* --- HARVEST ORDERS LIST --- */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="bg-white border border-border rounded-xl shadow-md p-6 text-sm text-muted-foreground italic">
            Loading harvest orders...
          </div>
        ) : error ? (
          <div className="bg-white border border-border rounded-xl shadow-md p-6 text-sm text-red-600">
            {error}
          </div>
        ) : orders.length === 0 ? (
          <div className="bg-white border border-border rounded-xl shadow-md p-6 text-sm text-muted-foreground italic">
            No harvest orders found.
          </div>
        ) : (
          orders.map((order, idx) => {
            const farm = order.farm_details;
            const vehicles = order.vehicle_details;
            const harvestor = Array.isArray(vehicles?.harvestors) ? vehicles?.harvestors?.[0] : undefined;
            const tractors = Array.isArray(vehicles?.tractors) ? vehicles?.tractors : [];
            const supervisor = order.supervisor_details;
            const fieldManager = order.field_manager_details;

            const status = String(order.status || '').toLowerCase();
            const displayId = order.order_id || `Order-${idx + 1}`;
            const tripSheetCount = Array.isArray(order.trip_sheet) ? order.trip_sheet.length : 0;

            return (
              <div key={displayId} className="bg-white border border-border rounded-xl shadow-md overflow-hidden">
            
            {/* TOP PANEL - Harvest Order ID */}
            <div className="bg-gradient-to-r from-primary/10 to-primary/5 px-6 py-3 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-primary" />
                <h3 className="font-bold text-lg text-foreground">{displayId}</h3>
              </div>
              <span className={cn("px-3 py-1 rounded-full text-xs font-semibold border", getStatusColor(status))}>
                {(status || '—').replace('_', ' ').toUpperCase()}
              </span>
            </div>

            {/* MAIN CONTENT - Three Details Sections */}
            <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6 divide-y lg:divide-y-0 lg:divide-x divide-dashed divide-border">
              
              {/* DETAIL 1 - FARM DETAILS */}
              <div className="space-y-3 pb-6 lg:pb-0 lg:pr-6">
                <div className="flex items-center gap-2 mb-4">
                  <MapPin className="w-5 h-5 text-green-600" />
                  <h4 className="font-bold text-sm text-foreground uppercase">Farm Details</h4>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Farm ID:</span>
                    <span className="font-semibold">{farm?.farm_id || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Farmer ID:</span>
                    <span className="font-semibold">{farm?.farmer_id || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Block ID:</span>
                    <span className="font-semibold">{farm?.block_id || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Block Name:</span>
                    <span className="font-semibold">{farm?.block_name || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Area:</span>
                    <span className="font-semibold">{farm?.area ?? '—'} acres</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Farming Option:</span>
                    <span className="font-semibold">{farm?.farming_option || '—'}</span>
                  </div>
                  <div className="pt-1">
                    <p className="text-muted-foreground text-xs mb-1">Land Coordinates:</p>
                    <p className="font-medium text-xs">{farm?.land_coordinated ? JSON.stringify(farm.land_coordinated) : '—'}</p>
                  </div>
                  <div className="pt-2 border-t border-dashed">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Farmer:</span>
                      <span className="font-semibold">{farm?.farmer_name || '—'}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* DETAIL 2 - VEHICLE DETAILS */}
              <div className="space-y-3 py-6 lg:py-0 lg:px-6">
                <div className="flex items-center gap-2 mb-4">
                  <Truck className="w-5 h-5 text-blue-600" />
                  <h4 className="font-bold text-sm text-foreground uppercase">Vehicle Details</h4>
                </div>
                <div className="space-y-4 text-sm">
                  {/* Harvestor */}
                  <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                    <p className="font-bold text-xs text-blue-700 mb-2">HARVESTOR</p>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">ID:</span>
                        <span className="font-semibold">{harvestor?.vehicle_id || '—'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Number:</span>
                        <span className="font-semibold">{harvestor?.vehicle_number || '—'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Contact:</span>
                        <span className="font-medium">{harvestor?.driver_contact || '—'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Tractors */}
                  <div className="bg-amber-50 p-3 rounded-lg border border-amber-100">
                    <p className="font-bold text-xs text-amber-700 mb-2">TRACTORS ({tractors.length})</p>
                    <div className="space-y-2">
                      {tractors.map((tractor, idx) => (
                        <div key={idx} className="border-b border-amber-200 last:border-0 pb-2 last:pb-0">
                          <div className="space-y-1 text-xs">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">ID:</span>
                              <span className="font-semibold">{tractor.vehicle_id || '—'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Number:</span>
                              <span className="font-semibold">{tractor.vehicle_number || '—'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Contact:</span>
                              <span className="font-medium">{tractor.driver_contact || '—'}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Tipper Card Number */}
                  <div className="bg-purple-50 p-3 rounded-lg border border-purple-100">
                    <p className="font-bold text-xs text-purple-700 mb-2">TIPPER CARD</p>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Card Number:</span>
                        <span className="font-semibold">{order.tipper_card_number ?? '—'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* DETAIL 3 - STAFF DETAILS */}
              <div className="space-y-3 pt-6 lg:pt-0 lg:pl-6">
                <div className="flex items-center gap-2 mb-4">
                  <User className="w-5 h-5 text-purple-600" />
                  <h4 className="font-bold text-sm text-foreground uppercase">Staff Details</h4>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="pt-1">
                    <p className="text-xs uppercase font-bold tracking-wide text-muted-foreground">Supervisor</p>
                    <div className="mt-2 space-y-2">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Supervisor ID:</span>
                        <span className="font-semibold">{supervisor?.supervisor_id || '—'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Name:</span>
                        <span className="font-semibold">{supervisor?.supervisor_name || '—'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Contact:</span>
                        <span className="font-medium">{supervisor?.suervisor_contact || supervisor?.supervisor_contact || '—'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-dashed">
                    <p className="text-xs uppercase font-bold tracking-wide text-muted-foreground">Field Manager</p>
                    <div className="mt-2 space-y-2">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">FM ID:</span>
                        <span className="font-semibold">{fieldManager?.field_manager_id || '—'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Name:</span>
                        <span className="font-semibold">{fieldManager?.name || '—'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Contact:</span>
                        <span className="font-medium">{fieldManager?.contact || '—'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* BOTTOM SEGMENT */}
            <div className="bg-muted/30 px-6 py-4 border-t border-border">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 items-center">
                <button 
                  onClick={() => handleViewTripSheet(displayId)}
                  className="flex items-center justify-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
                >
                  <FileText className="w-4 h-4" />
                  View Trip Sheet
                </button>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground mb-1">Trip Sheets</p>
                  <div className="flex items-center justify-center gap-1">
                    <Weight className="w-4 h-4 text-green-600" />
                    <p className="font-bold text-green-600">{tripSheetCount}</p>
                  </div>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground mb-1">Created At</p>
                  <div className="flex items-center justify-center gap-1">
                    <Clock className="w-4 h-4 text-blue-600" />
                    <p className="font-semibold text-xs">{formatCreatedAt(order.created_at)}</p>
                  </div>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground mb-1">Tipper Card</p>
                  <div className="flex items-center justify-center gap-1">
                    <Clock className="w-4 h-4 text-orange-600" />
                    <p className="font-semibold text-xs">{order.tipper_card_number ?? '—'}</p>
                  </div>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground mb-1">Status</p>
                  <span className={cn("px-3 py-1 rounded-full text-xs font-bold inline-flex items-center gap-1", getStatusColor(status))}>
                    {status === 'completed' && <CheckCircle2 className="w-3 h-3" />}
                    {(status || '—').replace('_', ' ').toUpperCase()}
                  </span>
                </div>
              </div>
            </div>

              </div>
            );
          })
        )}
      </div>

    </div>
  );
};

export default HarvestOrders;
