import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { Plus, Trash2, Map, CheckCircle, Clock, ArrowUp, ArrowDown, Bot, Building, Grid3x3, User, Phone, BadgeCheck } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import getBaseUrl from '@/lib/config';
import { useToast } from '@/hooks/use-toast';

interface LandRow {
  id: number;
  farmId?: string;
  village: string;
  farmerId: string;
  farmerName?: string;
  fetchedDetails: string | null;
  priority?: number;
  isNew?: boolean;
}

interface AvailableFarm {
  id: string | number;
  fullName: string;
  village?: string | null;
  district?: string | null;
  state?: string | null;
  phoneNumber?: string;
  landMapping?: {
    totalArea?: string | number;
    coordinates?: unknown[];
  };
  kyc?: unknown;
  agreements?: unknown[];
  createdAt?: Date;
}

interface Block {
  block_id: string;
  block_name?: string;
  total_area?: number;
  supervisor_details?: {
    supervisor_name?: string;
    // Backend typo in key: "suervisor_contact" (keep support for it)
    suervisor_contact?: string;
    supervisor_contact?: string;
    supervisor_id?: string;
  } | null;
}

interface Zone {
  zone_id: string;
  zone_name?: string;
  total_area?: number;
  field_manager?:
    | Array<{
        name?: string;
        field_manager_id?: string;
        contact?: string;
      }>
    | {
        name?: string;
        field_manager_id?: string;
        contact?: string;
      }
    | null;
}

interface ZoneLand {
  created_at?: string;
  area?: number;
  harvest_log?: unknown;
  priority?: number;
  block_id?: string;
  land_data?: {
    land_coordinates?: unknown[];
    farming_option?: string;
    state?: string;
    village?: string;
    land_media?: {
      images?: string[];
      video?: string;
    };
    district?: string;
  };
  farmer_id?: string;
  payment_log?: unknown;
  farm_id?: string;
  crop_type?: string;
}

interface Cluster {
  cluster_id: string;
  cluster_name?: string;
  total_area?: number;
}

interface FieldManager {
  staff_id?: string;
  manager_id: string;
  name: string;
  phone: string;
}

interface Supervisor {
  supervisor_id: string; // maps to API sup_id
  staff_id?: string;
  name: string;
  phone: string;
  designation?: string;
  department?: string;
  employmentType?: string;
}

type SupervisorApiResponse = {
  supervisors?: Array<{
    staff_id?: string;
    sup_id?: string;
    supervisor_info?: {
      staff_name?: string;
      staff_phone?: string;
      staff_department?: string;
      staff_designation?: string;
      employment_type?: string;
    };
  }>;
};

type FieldManagerApiResponse = {
  field_managers?: Array<{
    staff_id: string;
    manager_id: string;
    assigned_zones?: unknown;
    field_manager_info?: {
      staff_name?: string;
      staff_phone?: string;
      staff_department?: string;
      staff_designation?: string;
      employment_type?: string;
    };
  }>;
};

type EntityType = 'cluster' | 'zone' | 'block';

const Blocks = () => {
  const { toast } = useToast();
  
  const [activeTab, setActiveTab] = useState<EntityType>('cluster');

  // Block State
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [isBlockModalOpen, setIsBlockModalOpen] = useState(false);
  const [blockName, setBlockName] = useState('');
  const [blockLandRows, setBlockLandRows] = useState<LandRow[]>([
    { id: 1, village: '', farmerId: '', fetchedDetails: null }
  ]);
  const [viewBlock, setViewBlock] = useState<Block | null>(null);
  const [isViewBlockModalOpen, setIsViewBlockModalOpen] = useState(false);

  // Zone State
  const [zones, setZones] = useState<Zone[]>([]);
  const [isZoneModalOpen, setIsZoneModalOpen] = useState(false);
  const [zoneName, setZoneName] = useState('');
  const [zoneLandRows, setZoneLandRows] = useState<LandRow[]>([
    { id: 1, village: '', farmerId: '', fetchedDetails: null }
  ]);
  const [viewZone, setViewZone] = useState<Zone | null>(null);
  const [isViewZoneModalOpen, setIsViewZoneModalOpen] = useState(false);

  // Cluster State
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [isClusterModalOpen, setIsClusterModalOpen] = useState(false);
  const [clusterName, setClusterName] = useState('');
  const [clusterLandRows, setClusterLandRows] = useState<LandRow[]>([
    { id: 1, village: '', farmerId: '', fetchedDetails: null }
  ]);
  const [viewCluster, setViewCluster] = useState<Cluster | null>(null);
  const [isViewClusterModalOpen, setIsViewClusterModalOpen] = useState(false);

  // Common State
  const [availableFarms, setAvailableFarms] = useState<AvailableFarm[]>([]);
  const [loadingFarmsForEntity, setLoadingFarmsForEntity] = useState(false);
  const [availableBlocksForZone, setAvailableBlocksForZone] = useState<Block[]>([]);
  const [loadingBlocksForZone, setLoadingBlocksForZone] = useState(false);
  const [availableZonesForCluster, setAvailableZonesForCluster] = useState<Zone[]>([]);
  const [loadingZonesForCluster, setLoadingZonesForCluster] = useState(false);
  const [farmsInBlock, setFarmsInBlock] = useState<any[]>([]);
  const [loadingFarmsInBlock, setLoadingFarmsInBlock] = useState(false);
  const [blockAreaById, setBlockAreaById] = useState<Record<string, number>>({});
  const [zoneAreaById, setZoneAreaById] = useState<Record<string, number>>({});
  const [zoneLandCountById, setZoneLandCountById] = useState<Record<string, number>>({});
  const [blocksInZoneView, setBlocksInZoneView] = useState<Record<string, ZoneLand[]>>({});
  const [loadingBlocksInZoneView, setLoadingBlocksInZoneView] = useState(false);
  const [isAddingBlockLands, setIsAddingBlockLands] = useState(false);
  const [blockLandEditorRows, setBlockLandEditorRows] = useState<LandRow[]>([]);
  const [blockLandOriginalRows, setBlockLandOriginalRows] = useState<LandRow[]>([]);
  const [deletedBlockFarmerIds, setDeletedBlockFarmerIds] = useState<string[]>([]);

  // Zone -> Field Managers (local UI state for now)
  const [zoneFieldManagers, setZoneFieldManagers] = useState<Record<string, FieldManager[]>>({});
  const [isAssignManagerOpen, setIsAssignManagerOpen] = useState(false);
  const [assigningZone, setAssigningZone] = useState<Zone | null>(null);
  const [selectedManagerIds, setSelectedManagerIds] = useState<string[]>([]);
  const [fieldManagers, setFieldManagers] = useState<FieldManager[]>([]);
  const [isLoadingFieldManagers, setIsLoadingFieldManagers] = useState(false);
  const [fieldManagersError, setFieldManagersError] = useState<string | null>(null);
  const [isAssigningFieldManager, setIsAssigningFieldManager] = useState(false);

  // Block -> Supervisor (frontend-only for now)
  const [blockSupervisors, setBlockSupervisors] = useState<Record<string, Supervisor | null>>({});
  const [isAssignSupervisorOpen, setIsAssignSupervisorOpen] = useState(false);
  const [assigningBlock, setAssigningBlock] = useState<Block | null>(null);
  const [selectedSupervisorId, setSelectedSupervisorId] = useState<string>('');
  const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
  const [isLoadingSupervisors, setIsLoadingSupervisors] = useState(false);
  const [supervisorsError, setSupervisorsError] = useState<string | null>(null);
  const [isAssigningSupervisor, setIsAssigningSupervisor] = useState(false);

  useEffect(() => {
    loadBlocks();
    loadZones();
    loadClusters();
  }, []);

  useEffect(() => {
    // If dialog is open and nothing is selected yet, default to first supervisor.
    if (!isAssignSupervisorOpen) return;
    if (selectedSupervisorId) return;
    if (supervisors.length === 0) return;
    setSelectedSupervisorId(supervisors[0].supervisor_id);
  }, [isAssignSupervisorOpen, selectedSupervisorId, supervisors]);

  const fetchAllSupervisors = async () => {
    setIsLoadingSupervisors(true);
    setSupervisorsError(null);
    try {
      const base = getBaseUrl();
      const resp = await fetch(`${base.replace(/\/$/, '')}/supervisor_management/get_all_supervisors`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!resp.ok) throw new Error(`Server responded ${resp.status}`);
      const data = (await resp.json()) as SupervisorApiResponse;

      const list = Array.isArray(data?.supervisors) ? data.supervisors : [];
      const mapped: Supervisor[] = list
        .filter((s) => !!s?.sup_id && !!s?.staff_id)
        .map((s) => ({
          supervisor_id: String(s.sup_id),
          staff_id: String(s.staff_id),
          name: s.supervisor_info?.staff_name || 'Unknown',
          phone: s.supervisor_info?.staff_phone || 'N/A',
          designation: s.supervisor_info?.staff_designation,
          department: s.supervisor_info?.staff_department,
          employmentType: s.supervisor_info?.employment_type,
        }));

      setSupervisors(mapped);
      return mapped;
    } catch (error) {
      console.error('Failed to load supervisors:', error);
      setSupervisors([]);
      setSupervisorsError('Failed to load supervisors');
      toast({ title: 'Error', description: 'Failed to load supervisors', variant: 'destructive' });
      return [] as Supervisor[];
    } finally {
      setIsLoadingSupervisors(false);
    }
  };

  const fetchAllFieldManagers = async () => {
    setIsLoadingFieldManagers(true);
    setFieldManagersError(null);
    try {
      const base = getBaseUrl();
      const resp = await fetch(`${base.replace(/\/$/, '')}/field_manager/get_all_field_managers`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!resp.ok) throw new Error(`Server responded ${resp.status}`);
      const data = (await resp.json()) as FieldManagerApiResponse;
      const managers: FieldManager[] = (data.field_managers || [])
        .filter((m) => !!m.staff_id && !!m.manager_id)
        .map((m) => ({
          staff_id: m.staff_id,
          manager_id: m.manager_id,
          name: m.field_manager_info?.staff_name || 'Unknown',
          phone: m.field_manager_info?.staff_phone || 'N/A',
        }));
      setFieldManagers(managers);
      return managers;
    } catch (error) {
      console.error('Failed to load field managers:', error);
      setFieldManagers([]);
      setFieldManagersError('Failed to load field managers');
      toast({ title: 'Error', description: 'Failed to load field managers', variant: 'destructive' });
      return [] as FieldManager[];
    } finally {
      setIsLoadingFieldManagers(false);
    }
  };

  const openAssignFieldManager = (zone: Zone) => {
    setAssigningZone(zone);
    const current = zoneFieldManagers[zone.zone_id] || [];
    setSelectedManagerIds((current || []).map((manager) => manager.manager_id).filter(Boolean));
    setIsAssignManagerOpen(true);
    fetchAllFieldManagers().then((managers) => {
      if (managers.length === 0) return;

      if (current.length === 0) return;

      const restored = current
        .map((manager) => {
          if (manager.manager_id) return managers.find((item) => item.manager_id === manager.manager_id) || manager;
          if (manager.staff_id) return managers.find((item) => item.staff_id === manager.staff_id) || manager;
          if (manager.manager_id) return managers.find((item) => item.manager_id === manager.manager_id) || manager;
          return manager;
        })
        .filter(Boolean) as FieldManager[];

      setSelectedManagerIds(restored.map((manager) => manager.manager_id).filter(Boolean));
    });
  };

  const confirmAssignFieldManager = async () => {
    if (!assigningZone || selectedManagerIds.length === 0) return;
    const selected = fieldManagers.filter((m) => selectedManagerIds.includes(m.manager_id));
    if (selected.length === 0) {
      toast({ title: 'Error', description: 'Please select at least one field manager', variant: 'destructive' });
      return;
    }

    setIsAssigningFieldManager(true);
    try {
      const base = getBaseUrl();
      const resp = await fetch(`${base.replace(/\/$/, '')}/field_manager/assign_field_manager`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          field_manager_id: selected.map((manager) => manager.manager_id),
          Zone_id: assigningZone.zone_id,
        }),
      });

      let data: any = null;
      try {
        data = await resp.json();
      } catch {
        // allow empty or non-JSON responses
      }

      if (!resp.ok) {
        throw new Error((data && (data.message || data.error)) || `Server responded ${resp.status}`);
      }

      const successValue = data?.success;
      const isSuccess =
        typeof successValue === 'boolean'
          ? successValue
          : typeof successValue === 'string'
            ? ['true', '1', 'yes', 'y'].includes(successValue.trim().toLowerCase())
            : typeof successValue === 'number'
              ? successValue === 1
              : true;

      if (!isSuccess) {
        toast({ title: 'Not assigned', description: 'API returned success=false', variant: 'destructive' });
        return;
      }

      setZoneFieldManagers((prev) => ({ ...prev, [assigningZone.zone_id]: selected }));
      setIsAssignManagerOpen(false);
      toast({
        title: 'Assigned',
        description: `Field manager${selected.length > 1 ? 's' : ''} assigned to ${assigningZone.zone_name || assigningZone.zone_id}`,
      });
    } catch (error) {
      console.error('Failed to assign field manager:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to assign field managers',
        variant: 'destructive',
      });
    } finally {
      setIsAssigningFieldManager(false);
    }
  };

  const openAssignSupervisor = (block: Block) => {
    setAssigningBlock(block);
    const current = blockSupervisors[String(block.block_id)];
    setSelectedSupervisorId(current?.supervisor_id || '');
    setIsAssignSupervisorOpen(true);
    fetchAllSupervisors().then((list) => {
      if (current?.supervisor_id) return;
      if (list.length === 0) return;
      setSelectedSupervisorId(list[0].supervisor_id);
    });
  };

  const openAddLandEditor = async () => {
    setIsAddingBlockLands(true);
    setDeletedBlockFarmerIds([]);

    try {
      const base = getBaseUrl();
      const resp = await fetch(`${base.replace(/\/$/, '')}/farmer_managment/farm_for_block`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (resp.ok) {
        const result = await resp.json();
        const transformed: AvailableFarm[] = (result.not_assigned_farms || []).map((item: any) => {
          const kyc = item.kyc_data || null;
          return {
            id: item.farm_id,
            fullName: item.farmer_name || 'Unknown',
            phoneNumber: item.farmer_contact || 'N/A',
            village: item.village || 'N/A',
            district: item.district || 'N/A',
            state: item.state || 'N/A',
            kyc: kyc ? { verified: true } : undefined,
            landMapping: item.area != null
              ? { totalArea: item.area, coordinates: [] }
              : undefined,
            agreements: [],
            createdAt: new Date(),
          } as any;
        });
        setAvailableFarms(transformed);
      } else {
        setAvailableFarms([]);
      }
    } catch (error) {
      console.error('Failed to load available farms for block editor:', error);
      setAvailableFarms([]);
      toast({ title: 'Error', description: 'Failed to load farms for adding lands', variant: 'destructive' });
    }

    const currentRows = farmsInBlock.length > 0
      ? farmsInBlock.map((farm: any, index: number) => ({
          id: farm.farm_id ?? Date.now() + index,
          farmId: farm.farm_id ? String(farm.farm_id) : undefined,
          village: farm?.land_data?.village || '',
          farmerId: farm?.farmer_id ? String(farm.farmer_id) : '',
          farmerName: farm?.farmer_name?.farmer_name || farm?.farmer_name || farm?.farmer_id || '',
          fetchedDetails: farm?.area != null ? `${farm.area} Acres in ${farm?.land_data?.village || ''}` : null,
          priority: farm?.priority ?? index,
          isNew: false,
        }))
      : [{ id: Date.now(), village: '', farmerId: '', farmerName: '', fetchedDetails: null, priority: 0, isNew: true }];

    setBlockLandEditorRows(currentRows);
    setBlockLandOriginalRows(currentRows.map((row) => ({ ...row, isNew: false })));
  };

  const removeBlockEditorRow = (row: LandRow) => {
    if (!row.isNew && row.farmerId) {
      setDeletedBlockFarmerIds((prev) => (prev.includes(row.farmerId) ? prev : [...prev, row.farmerId]));
    }
    removeLandRow(row.id, blockLandEditorRows, setBlockLandEditorRows);
  };

  const buildBlockUpdatePayload = () => {
    const currentRowKeys = new Set(
      blockLandEditorRows
        .filter((row) => !!row.farmerId)
        .map((row) => row.farmerId)
    );

    const mergedRows = [
      ...blockLandEditorRows.filter((row) => !!row.farmerId),
      ...blockLandOriginalRows.filter((row) => {
        return !!row.farmerId && (
          deletedBlockFarmerIds.includes(row.farmerId) || !currentRowKeys.has(row.farmerId)
        );
      }).map((row) => ({
        ...row,
        priority: -1,
      })),
    ];

    const farmerList = mergedRows.map((row, index) => {
      const areaFromDetails = row.fetchedDetails
        ? parseFloat(row.fetchedDetails.match(/^(\d+(?:\.\d+)?) Acres/)?.[1] || '0')
        : 0;

      return {
        priority: row.priority ?? index,
        farm_id: row.farmerId,
        village: row.village,
        area: areaFromDetails || Number((availableFarms.find((farm) => String(farm.id) === row.farmerId)?.landMapping?.totalArea) ?? 0) || 0,
      };
    });

    const totalArea = Number(farmerList.reduce((sum, row) => sum + (row.area || 0), 0).toFixed(2));

    return {
      block_id: assigningBlock?.block_id || viewBlock?.block_id || '',
      block_data: {
        block_name: assigningBlock?.block_name || viewBlock?.block_name || '',
        farmer: farmerList,
        total_area: totalArea,
      },
    };
  };

  const confirmAssignSupervisor = async () => {
    if (!assigningBlock || !selectedSupervisorId) return;
    const selected = supervisors.find((s) => s.supervisor_id === selectedSupervisorId) || null;
    if (!selected) {
      toast({ title: 'Error', description: 'Please select a supervisor', variant: 'destructive' });
      return;
    }

    setIsAssigningSupervisor(true);
    try {
      const base = getBaseUrl();
      const resp = await fetch(`${base.replace(/\/$/, '')}/supervisor_management/assign_supervisor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supervisor_id: selected.supervisor_id,
          block_id: String(assigningBlock.block_id),
        }),
      });

      let data: any = null;
      try {
        data = await resp.json();
      } catch {
        // ignore non-json
      }

      if (!resp.ok) {
        throw new Error((data && (data.message || data.error)) || `Server responded ${resp.status}`);
      }

      const successValue = data?.success;
      const isSuccess =
        typeof successValue === 'boolean'
          ? successValue
          : typeof successValue === 'string'
            ? ['true', '1', 'yes', 'y'].includes(successValue.trim().toLowerCase())
            : typeof successValue === 'number'
              ? successValue === 1
              : true;

      if (!isSuccess) {
        toast({ title: 'Not assigned', description: 'API returned success=false', variant: 'destructive' });
        return;
      }

      setBlockSupervisors((prev) => ({ ...prev, [String(assigningBlock.block_id)]: selected }));
      setIsAssignSupervisorOpen(false);
      toast({
        title: 'Assigned',
        description: `Supervisor assigned to ${assigningBlock.block_name || assigningBlock.block_id}`,
      });
    } catch (error) {
      console.error('Failed to assign supervisor:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to assign supervisor',
        variant: 'destructive',
      });
    } finally {
      setIsAssigningSupervisor(false);
    }
  };

  const loadBlocks = async () => {
    try {
      const base = getBaseUrl();
      const resp = await fetch(`${base.replace(/\/$/, '')}/farmer_managment/get_blocks`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!resp.ok) throw new Error(`Server responded ${resp.status}`);
      const result = await resp.json();
      const list: Block[] = Array.isArray(result?.blocks) ? result.blocks : [];
      setBlocks(list);

      const areaEntries = await Promise.all(
        list.map(async (block) => {
          try {
            const farmsResp = await fetch(
              `${base.replace(/\/$/, '')}/farmer_managment/get_all_farms_in_a_block/${block.block_id}`,
              {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
              }
            );

            if (!farmsResp.ok) {
              return [String(block.block_id), Number(block.total_area ?? 0)] as const;
            }

            const farmsResult = await farmsResp.json();
            const farms = Array.isArray(farmsResult?.farms) ? farmsResult.farms : [];
            const totalArea = farms.reduce((sum: number, farm: any) => {
              const areaValue = Number(farm?.area ?? 0);
              return sum + (Number.isFinite(areaValue) ? areaValue : 0);
            }, 0);

            return [String(block.block_id), Number(totalArea.toFixed(2))] as const;
          } catch {
            return [String(block.block_id), Number(block.total_area ?? 0)] as const;
          }
        })
      );

      setBlockAreaById(Object.fromEntries(areaEntries));

      // If backend already returns supervisor_details, reflect it in the UI.
      setBlockSupervisors((prev) => {
        const next: Record<string, Supervisor | null> = { ...prev };
        for (const block of list) {
          const key = String(block.block_id);
          const details = block?.supervisor_details;
          if (details === null) {
            next[key] = null;
            continue;
          }
          if (!details) continue;

          const supervisorId = details.supervisor_id;
          if (!supervisorId) continue;

          next[key] = {
            supervisor_id: String(supervisorId),
            name: details.supervisor_name || 'Unknown',
            phone: details.suervisor_contact || details.supervisor_contact || 'N/A',
          };
        }
        return next;
      });
    } catch (error) {
      console.error('Failed to load blocks:', error);
      toast({ title: 'Error', description: 'Failed to load blocks', variant: 'destructive' });
    }
  };

  const loadZones = async () => {
    try {
      const base = getBaseUrl();
      const resp = await fetch(`${base.replace(/\/$/, '')}/farmer_managment/get_zones`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!resp.ok) throw new Error(`Server responded ${resp.status}`);
      const result = await resp.json();
      const list: Zone[] = Array.isArray(result?.zones) ? result.zones : [];
      setZones(list);

      const areaEntries = await Promise.all(
        list.map(async (zone) => {
          try {
            const landsResp = await fetch(
              `${base.replace(/\/$/, '')}/farmer_managment/get_lands_in_zone/${zone.zone_id}`,
              {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
              }
            );

            if (!landsResp.ok) {
              return [String(zone.zone_id), Number(zone.total_area ?? 0)] as const;
            }

            const landsResult = await landsResp.json();
            const groupedLands = landsResult?.lands && typeof landsResult.lands === 'object' ? landsResult.lands : {};
            const allLands = Object.values(groupedLands).flat() as any[];
            const totalArea = allLands.reduce((sum: number, land: any) => {
              const areaValue = Number(land?.area ?? 0);
              return sum + (Number.isFinite(areaValue) ? areaValue : 0);
            }, 0);
            const totalCount = allLands.length;

            setZoneLandCountById((prev) => ({ ...prev, [String(zone.zone_id)]: totalCount }));
            return [String(zone.zone_id), Number(totalArea.toFixed(2))] as const;
          } catch {
            setZoneLandCountById((prev) => ({ ...prev, [String(zone.zone_id)]: 0 }));
            return [String(zone.zone_id), Number(zone.total_area ?? 0)] as const;
          }
        })
      );

      setZoneAreaById(Object.fromEntries(areaEntries));

      // If backend already returns field_manager, reflect it in the UI.
      setZoneFieldManagers((prev) => {
        const next: Record<string, FieldManager[]> = { ...prev };
        for (const zone of list) {
          const key = String(zone.zone_id);
          const fm = zone?.field_manager;
          if (fm === null) {
            next[key] = [];
            continue;
          }
          if (!fm) continue;

          const managers = Array.isArray(fm) ? fm : [fm];
          next[key] = managers
            .filter((item) => !!item?.field_manager_id)
            .map((item) => ({
              manager_id: String(item.field_manager_id),
              name: item.name || 'Unknown',
              phone: item.contact || 'N/A',
            }));
        }
        return next;
      });
    } catch (error) {
      console.error('Failed to load zones:', error);
      toast({ title: 'Error', description: 'Failed to load zones', variant: 'destructive' });
    }
  };

  const loadClusters = async () => {
    try {
      const base = getBaseUrl();
      const resp = await fetch(`${base.replace(/\/$/, '')}/farmer_managment/get_clusters`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!resp.ok) throw new Error(`Server responded ${resp.status}`);
      const result = await resp.json();
      setClusters(result.clusters || []);
    } catch (error) {
      console.error('Failed to load clusters:', error);
      toast({ title: 'Error', description: 'Failed to load clusters', variant: 'destructive' });
    }
  };

  const addLandRow = (landRows: LandRow[], setLandRows: Dispatch<SetStateAction<LandRow[]>>) => {
    setLandRows([
      ...landRows,
      { id: Date.now(), village: '', farmerId: '', farmerName: '', fetchedDetails: null, priority: landRows.length, isNew: true }
    ]);
  };

  const removeLandRow = (id: number, landRows: LandRow[], setLandRows: Dispatch<SetStateAction<LandRow[]>>) => {
    setLandRows(landRows.filter(row => row.id !== id));
  };

  const moveLandRow = (id: number, direction: 'up' | 'down', landRows: LandRow[], setLandRows: Dispatch<SetStateAction<LandRow[]>>) => {
    setLandRows(prev => {
      const index = prev.findIndex(r => r.id === id);
      if (index < 0) return prev;
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
  };

  const handleLandChange = (id: number, field: keyof LandRow, value: string, landRows: LandRow[], setLandRows: Dispatch<SetStateAction<LandRow[]>>) => {
    setLandRows(prev => prev.map(row => {
      if (row.id === id) {
        const updatedRow = { ...row, [field]: value };
        if (field === 'farmerId') {
          const selectedFarmer = availableFarms.find(f => f.id.toString() === value);
          if (selectedFarmer) {
            const area = selectedFarmer.landMapping?.totalArea || '0';
            updatedRow.fetchedDetails = `${area} Acres in ${selectedFarmer.village}`;
            updatedRow.village = selectedFarmer.village || '';
            updatedRow.farmerName = selectedFarmer.fullName;
          } else {
            updatedRow.fetchedDetails = null;
            updatedRow.village = '';
            updatedRow.farmerName = '';
          }
        }
        if (field === 'priority') {
          updatedRow.priority = Number(value);
        }
        return updatedRow;
      }
      return row;
    }));
  };

  const moveEditorRow = (id: number, direction: 'up' | 'down') => {
    setBlockLandEditorRows((prev) => {
      const index = prev.findIndex((row) => row.id === id);
      if (index < 0) return prev;
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.splice(targetIndex, 0, moved);
      return next.map((row, rowIndex) => ({ ...row, priority: rowIndex }));
    });
  };

  const createGenericHandler = (entityType: EntityType, landRows: LandRow[], entityName: string, endpoint: string, resetCallback: () => void) => {
    return async () => {
      const farmerArr = landRows
        .filter(row => !!row.farmerId)
        .map((row, idx) => {
          let area = 0;
          if (row.fetchedDetails) {
            const match = row.fetchedDetails.match(/^(\d+(?:\.\d+)?) Acres/);
            if (match) area = parseFloat(match[1]);
          }
          return {
            farmer_id: row.farmerId,
            village: row.village,
            area,
            priority: idx
          };
        });

      const total = farmerArr.reduce((acc, f) => acc + (f.area || 0), 0);
      const base = getBaseUrl();

      try {
        let payload: any;
        if (entityType === 'zone') {
          // build block_list expected by backend (use landRows passed to handler)
          const block_list = landRows
            .filter(r => !!r.farmerId)
            .map((r, idx) => {
              const blk = availableBlocksForZone.find(b => b.block_id === r.farmerId);
              const area = blk?.total_area ?? (r.fetchedDetails ? parseFloat(String((r.fetchedDetails.match(/^(\d+(?:\.\d+)?)/) || ['0'])[0])) : 0);
              return {
                total_area: area || 0,
                block_id: r.farmerId,
                priority: idx
              };
            });
          payload = {
            zone_name: entityName,
            block_list
          };
        } else if (entityType === 'cluster') {
          // build zone_list expected by backend
          const zone_list = landRows
            .filter(r => !!r.farmerId)
            .map((r, idx) => {
              const zn = availableZonesForCluster.find(z => z.zone_id === r.farmerId);
              const area = zn?.total_area ?? (r.fetchedDetails ? parseFloat(String((r.fetchedDetails.match(/^(\d+(?:\.\d+)?)/) || ['0'])[0])) : 0);
              return {
                total_area: area || 0,
                zone_id: r.farmerId,
                priority: idx
              };
            });
          payload = {
            cluster_name: entityName,
            zone_list
          };
        } else if (entityType === 'block') {
          payload = {
            block_name: entityName,
            farmer: landRows
              .filter((row) => !!row.farmerId)
              .map((row, idx) => {
                const areaFromDetails = row.fetchedDetails
                  ? parseFloat(row.fetchedDetails.match(/^(\d+(?:\.\d+)?) Acres/)?.[1] || '0')
                  : 0;

                return {
                  priority: row.priority ?? idx,
                  farm_id: row.farmerId,
                  village: row.village,
                  area:
                    areaFromDetails ||
                    Number((availableFarms.find((farm) => String(farm.id) === row.farmerId)?.landMapping?.totalArea) ?? 0) ||
                    0,
                };
              }),
            total_area: total,
          };
        } else {
          payload = {
            [`${entityType}_name`]: entityName,
            farmer: farmerArr,
            total_area: total
          };
        }

        const resp = await fetch(`${base.replace(/\/$/, '')}/farmer_managment/${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!resp.ok) throw new Error(`Server responded ${resp.status}`);

        toast({ title: 'Success', description: `${entityType.charAt(0).toUpperCase() + entityType.slice(1)} created successfully!` });
        resetCallback();

        if (entityType === 'cluster') loadClusters();
        else if (entityType === 'zone') loadZones();
        else if (entityType === 'block') loadBlocks();
      } catch (error) {
        toast({ title: 'Error', description: `Failed to create ${entityType}`, variant: 'destructive' });
      }
    };
  };

  const handleCreateCluster = async () => {
    const zone_list = clusterLandRows
      .filter(r => !!r.farmerId)
      .map((r, idx) => {
        const zn = availableZonesForCluster.find(z => z.zone_id === r.farmerId);
        const area = zn?.total_area ?? (r.fetchedDetails ? parseFloat((r.fetchedDetails.match(/^(\d+(?:\.\d+)?)/) || ['0'])[0]) : 0);
        return {
          total_area: area || 0,
          zone_id: r.farmerId,
          priority: idx
        };
      });

    const payload = {
      zone_list,
      cluster_name: clusterName
    };

    const base = getBaseUrl();
    try {
      console.debug('Creating cluster with payload:', payload);
      const resp = await fetch(`${base.replace(/\/$/, '')}/farmer_managment/create_cluster`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!resp.ok) throw new Error(`Server responded ${resp.status}`);

      toast({ title: 'Success', description: `Cluster created successfully!` });
      setIsClusterModalOpen(false);
      setClusterName('');
      setClusterLandRows([{ id: 1, village: '', farmerId: '', fetchedDetails: null }]);
      loadClusters();
    } catch (error) {
      console.error('Failed to create cluster:', error);
      toast({ title: 'Error', description: 'Failed to create cluster', variant: 'destructive' });
    }
  };

  const handleCreateZone = createGenericHandler('zone', zoneLandRows, zoneName, 'create_zone', () => {
    setIsZoneModalOpen(false);
    setZoneName('');
    setZoneLandRows([{ id: 1, village: '', farmerId: '', fetchedDetails: null }]);
  });

  const handleCreateBlock = createGenericHandler('block', blockLandRows, blockName, 'create_block', () => {
    setIsBlockModalOpen(false);
    setBlockName('');
    setBlockLandRows([{ id: 1, village: '', farmerId: '', fetchedDetails: null }]);
  });

  const getZoneViewTotalArea = () => {
    const total = Object.values(blocksInZoneView).reduce((sum, lands) => {
      return sum + lands.reduce((landSum, land) => {
        const areaValue = Number(land?.area ?? 0);
        return landSum + (Number.isFinite(areaValue) ? areaValue : 0);
      }, 0);
    }, 0);
    return Number(total.toFixed(2));
  };

  const dashboardTotals = {
    clusters: clusters.length,
    zones: zones.length,
    blocks: blocks.length,
    lands: Object.values(zoneLandCountById).reduce((sum, count) => sum + (Number.isFinite(Number(count)) ? Number(count) : 0), 0),
    area: Number(
      Object.values(zoneAreaById).reduce((sum, area) => sum + (Number.isFinite(Number(area)) ? Number(area) : 0), 0).toFixed(2)
    ),
  };

  const getEntityCardArea = (entityType: EntityType, entity: any) => {
    if (entityType === 'zone') {
      return zoneAreaById[String(entity.zone_id)] ?? entity.total_area ?? 0;
    }
    if (entityType === 'block') {
      return blockAreaById[String(entity.block_id)] ?? entity.total_area ?? 0;
    }
    return entity.total_area ?? 0;
  };

  return (
    <div className="p-8">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4 mb-6">
        {[
          { label: 'Total Clusters', value: dashboardTotals.clusters },
          { label: 'Total Zones', value: dashboardTotals.zones },
          { label: 'Total Blocks', value: dashboardTotals.blocks },
          { label: 'Total Lands', value: dashboardTotals.lands },
          { label: 'Total Area', value: `${dashboardTotals.area} acres` },
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-xl border border-[#0D3A35]/15 bg-[#0D3A35]/5 px-4 py-3 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[#0D3A35]/55">{kpi.label}</div>
            <div className="mt-2 text-2xl font-bold text-[#0D3A35]">{kpi.value}</div>
          </div>
        ))}
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as EntityType)} className="w-full">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-[0.24em] text-muted-foreground">Hierarchy View</h2>
            <p className="text-sm text-muted-foreground">Switch between clusters, zones, and blocks</p>
          </div>
        </div>

        <TabsList className="mb-8 grid h-auto w-full grid-cols-1 gap-4 bg-transparent p-0 sm:grid-cols-2 lg:grid-cols-3">
          <TabsTrigger
            value="cluster"
            className="group relative flex h-auto min-h-20 w-full min-w-0 flex-col items-start justify-between whitespace-normal rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-slate-600 shadow-sm transition-all duration-200 hover:border-[#0D3A35]/30 data-[state=active]:border-[#0D3A35] data-[state=active]:bg-[#0D3A35] data-[state=active]:text-white data-[state=active]:shadow-md"
          >
            <div className="flex w-full items-center justify-between">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[#0D3A35]/10 text-[#0D3A35] transition-colors group-data-[state=active]:bg-white/15 group-data-[state=active]:text-white">
                <Grid3x3 className="w-4 h-4" />
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#0D3A35]/70 group-data-[state=active]:text-white/80">
                01
              </span>
            </div>
            <div className="min-w-0">
              <div className="text-base font-semibold leading-tight">Clusters</div>
              <div className="line-clamp-2 break-words text-xs leading-tight text-slate-500 group-data-[state=active]:text-white/80">Group farms into clusters</div>
            </div>
          </TabsTrigger>
          <TabsTrigger
            value="zone"
            className="group relative flex h-auto min-h-20 w-full min-w-0 flex-col items-start justify-between whitespace-normal rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-slate-600 shadow-sm transition-all duration-200 hover:border-[#0D3A35]/30 data-[state=active]:border-[#0D3A35] data-[state=active]:bg-[#0D3A35] data-[state=active]:text-white data-[state=active]:shadow-md"
          >
            <div className="flex w-full items-center justify-between">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[#0D3A35]/10 text-[#0D3A35] transition-colors group-data-[state=active]:bg-white/15 group-data-[state=active]:text-white">
                <Building className="w-4 h-4" />
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#0D3A35]/70 group-data-[state=active]:text-white/80">
                02
              </span>
            </div>
            <div className="min-w-0">
              <div className="text-base font-semibold leading-tight">Zones</div>
              <div className="line-clamp-2 break-words text-xs leading-tight text-slate-500 group-data-[state=active]:text-white/80">Organize blocks inside zones</div>
            </div>
          </TabsTrigger>
          <TabsTrigger
            value="block"
            className="group relative flex h-auto min-h-20 w-full min-w-0 flex-col items-start justify-between whitespace-normal rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-slate-600 shadow-sm transition-all duration-200 hover:border-[#0D3A35]/30 data-[state=active]:border-[#0D3A35] data-[state=active]:bg-[#0D3A35] data-[state=active]:text-white data-[state=active]:shadow-md"
          >
            <div className="flex w-full items-center justify-between">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[#0D3A35]/10 text-[#0D3A35] transition-colors group-data-[state=active]:bg-white/15 group-data-[state=active]:text-white">
                <Map className="w-4 h-4" />
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#0D3A35]/70 group-data-[state=active]:text-white/80">
                03
              </span>
            </div>
            <div className="min-w-0">
              <div className="text-base font-semibold leading-tight">Blocks</div>
              <div className="line-clamp-2 break-words text-xs leading-tight text-slate-500 group-data-[state=active]:text-white/80">Manage farms inside blocks</div>
            </div>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="cluster" className="space-y-6">
          {renderEntityContent('cluster', clusters, {
            isModalOpen: isClusterModalOpen,
            setIsModalOpen: setIsClusterModalOpen,
            entityName: clusterName,
            setEntityName: setClusterName,
            landRows: clusterLandRows,
            setLandRows: setClusterLandRows,
            viewEntity: viewCluster,
            setViewEntity: setViewCluster,
            isViewModalOpen: isViewClusterModalOpen,
            setIsViewModalOpen: setIsViewClusterModalOpen,
            handleCreate: handleCreateCluster,
            entityLabel: 'Cluster',
            createEndpoint: 'create_cluster'
          })}
        </TabsContent>

        <TabsContent value="zone" className="space-y-6">
          {renderEntityContent('zone', zones, {
            isModalOpen: isZoneModalOpen,
            setIsModalOpen: setIsZoneModalOpen,
            entityName: zoneName,
            setEntityName: setZoneName,
            landRows: zoneLandRows,
            setLandRows: setZoneLandRows,
            viewEntity: viewZone,
            setViewEntity: setViewZone,
            isViewModalOpen: isViewZoneModalOpen,
            setIsViewModalOpen: setIsViewZoneModalOpen,
            handleCreate: handleCreateZone,
            entityLabel: 'Zone',
            createEndpoint: 'create_zone'
          })}
        </TabsContent>

        <TabsContent value="block" className="space-y-6">
          {renderEntityContent('block', blocks, {
            isModalOpen: isBlockModalOpen,
            setIsModalOpen: setIsBlockModalOpen,
            entityName: blockName,
            setEntityName: setBlockName,
            landRows: blockLandRows,
            setLandRows: setBlockLandRows,
            viewEntity: viewBlock,
            setViewEntity: setViewBlock,
            isViewModalOpen: isViewBlockModalOpen,
            setIsViewModalOpen: setIsViewBlockModalOpen,
            handleCreate: handleCreateBlock,
            entityLabel: 'Block',
            createEndpoint: 'create_block'
          })}
        </TabsContent>
      </Tabs>
    </div>
  );

  function renderEntityContent(
    entityType: EntityType,
    entities: any[],
    config: {
      isModalOpen: boolean;
      setIsModalOpen: (open: boolean) => void;
      entityName: string;
      setEntityName: (name: string) => void;
      landRows: LandRow[];
      setLandRows: Dispatch<SetStateAction<LandRow[]>>;
      viewEntity: any;
      setViewEntity: (entity: any) => void;
      isViewModalOpen: boolean;
      setIsViewModalOpen: (open: boolean) => void;
      handleCreate: () => Promise<void>;
      entityLabel: string;
      createEndpoint: string;
    }
  ) {
    const getViewTotalArea = () => {
      if (entityType === 'zone') {
        return getZoneViewTotalArea();
      }

      if (entityType !== 'block') {
        return config.viewEntity?.total_area ?? 0;
      }

      const total = farmsInBlock.reduce((sum, farm: any) => {
        const areaValue = Number(farm?.area ?? 0);
        return sum + (Number.isFinite(areaValue) ? areaValue : 0);
      }, 0);
      return Number(total.toFixed(2));
    };

    return (
      <>
        {/* Header & Action */}
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">{config.entityLabel} Management</h2>
            <p className="text-sm text-muted-foreground">Create, review, and organize your hierarchy</p>
          </div>

          <Dialog
            open={config.isModalOpen}
            onOpenChange={(open) => {
              config.setIsModalOpen(open);
              if (open) {
                setLoadingFarmsForEntity(true);
                const base = getBaseUrl();
                fetch(`${base.replace(/\/$/, '')}/farmer_managment/farm_for_block`, {
                  method: 'GET',
                  headers: { 'Content-Type': 'application/json' },
                })
                  .then(async resp => {
                    if (!resp.ok) throw new Error(`Server responded ${resp.status}`);
                    const result = await resp.json();
                    const transformed: AvailableFarm[] = (result.not_assigned_farms || []).map((item: any) => {
                      const kyc = item.kyc_data || null;
                      return {
                        id: item.farm_id,
                        fullName: item.farmer_name || 'Unknown',
                        phoneNumber: item.farmer_contact || 'N/A',
                        village: item.village || 'N/A',
                        district: item.district || 'N/A',
                        state: item.state || 'N/A',
                        profileImageUrl: undefined,
                        kyc: kyc ? { verified: true } : undefined,
                        landMapping: item.area != null
                          ? { totalArea: item.area, coordinates: [] }
                          : undefined,
                        agreements: [],
                        createdAt: new Date(),
                      } as any;
                    });
                    setAvailableFarms(transformed);
                  })
                  .catch(() => {
                    setAvailableFarms([]);
                    toast({ title: 'Error', description: 'Failed to load available farms', variant: 'destructive' });
                  })
                  .finally(() => setLoadingFarmsForEntity(false));

                // if zone modal, also load available blocks to choose from
                if (entityType === 'zone') {
                  setLoadingBlocksForZone(true);
                  fetch(`${base.replace(/\/$/, '')}/farmer_managment/block_for_zone`, {
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json' },
                  })
                    .then(async resp => {
                      if (!resp.ok) throw new Error(`Server responded ${resp.status}`);
                      const data = await resp.json();
                      setAvailableBlocksForZone(Array.isArray(data) ? data : []);
                    })
                    .catch(() => {
                      setAvailableBlocksForZone([]);
                      toast({ title: 'Error', description: 'Failed to load blocks for zone', variant: 'destructive' });
                    })
                    .finally(() => setLoadingBlocksForZone(false));
                }

                // if cluster modal, load available zones to choose from
                if (entityType === 'cluster') {
                  setLoadingZonesForCluster(true);
                  fetch(`${base.replace(/\/$/, '')}/farmer_managment/zone_for_cluster`, {
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json' },
                  })
                    .then(async resp => {
                      if (!resp.ok) throw new Error(`Server responded ${resp.status}`);
                      const data = await resp.json();
                      setAvailableZonesForCluster(Array.isArray(data) ? data : []);
                    })
                    .catch(() => {
                      setAvailableZonesForCluster([]);
                      toast({ title: 'Error', description: 'Failed to load zones for cluster', variant: 'destructive' });
                    })
                    .finally(() => setLoadingZonesForCluster(false));
                }
              } else {
                setAvailableFarms([]);
                setAvailableBlocksForZone([]);
                config.setEntityName('');
                config.setLandRows([{ id: 1, village: '', farmerId: '', fetchedDetails: null }]);
              }
            }}
          >
            <DialogTrigger asChild>
              <Button className="gap-2 bg-[#0D3A35] hover:bg-[#092b27]">
                <Plus className="w-4 h-4" /> Create {config.entityLabel}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-2xl font-bold">Create New {config.entityLabel}</DialogTitle>
              </DialogHeader>

              <div className="space-y-6 py-4">
                {/* Entity Name Input */}
                <div className="flex gap-4 items-end">
                  <div className="flex-1 space-y-2">
                    <label className="text-sm font-medium">{config.entityLabel} Name</label>
                    <Input
                      placeholder={`e.g. ${entityType === 'cluster' ? 'North Region Alpha' : entityType === 'zone' ? 'Zone Central' : 'North Sector Alpha'}`}
                      value={config.entityName}
                      onChange={(e) => config.setEntityName(e.target.value)}
                    />
                  </div>
                  <div className="mb-1">
                    <div className="bg-muted/50 border border-border rounded-lg px-6 py-3 flex flex-col items-center min-w-[120px]">
                      <span className="text-xs text-muted-foreground mb-1">Total Area</span>
                      <span className="text-xl font-bold">
                        {(() => {
                          let total = 0;
                          config.landRows.forEach(row => {
                            if (row.fetchedDetails) {
                              const match = row.fetchedDetails.match(/^(\d+(?:\.\d+)?) Acres/);
                              if (match) total += parseFloat(match[1]);
                            }
                          });
                          return total;
                        })()} acres
                      </span>
                    </div>
                  </div>
                </div>

                {/* For Zone: we'll show blocks in the repeater below (as Add Block) */}

                {/* Add Land / Add Block Repeater */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <h3 className="text-lg font-semibold">{entityType === 'zone' ? 'Add Block' : 'Add Land'}</h3>
                    <Button
                      onClick={() => addLandRow(config.landRows, config.setLandRows)}
                      size="sm"
                      variant="outline"
                      className="gap-2 text-[#0D3A35] border-[#0D3A35] hover:bg-[#0D3A35]/5"
                    >
                      <Plus className="w-4 h-4" /> Add Row
                    </Button>
                  </div>

                  <div className="border rounded-lg overflow-hidden bg-white/50">
                    {/* Header */}
                    <div className="grid grid-cols-12 gap-4 p-3 bg-muted/50 border-b text-sm font-medium text-muted-foreground">
                      <div className="col-span-1 text-center">S.No</div>
                      <div className="col-span-1 text-center">Priority</div>
                      <div className="col-span-4">{entityType === 'zone' ? 'Block' : 'Farmer Name'}</div>
                      <div className="col-span-3">Fetched Details</div>
                      <div className="col-span-3">{entityType === 'zone' ? 'Block Name' : 'Village'}</div>
                      <div className="col-span-1 text-center">Action</div>
                    </div>

                    {/* Rows */}
                    <div className="divide-y">
                      {config.landRows.map((row, index) => (
                        <div key={row.id} className="grid grid-cols-12 gap-4 p-3 items-center hover:bg-muted/20 transition-colors">
                          <div className="col-span-1 text-center text-muted-foreground">{index + 1}</div>

                          <div className="col-span-1 flex items-center justify-center gap-1">
                            <div className="min-w-[28px] h-7 px-2 rounded-md border border-border bg-muted/30 text-xs font-semibold text-muted-foreground flex items-center justify-center">
                              {index}
                            </div>
                            <div className="flex flex-col">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                disabled={index === 0}
                                onClick={() => moveLandRow(row.id, 'up', config.landRows, config.setLandRows)}
                                aria-label="Move up"
                                title="Move up"
                              >
                                <ArrowUp className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                disabled={index === config.landRows.length - 1}
                                onClick={() => moveLandRow(row.id, 'down', config.landRows, config.setLandRows)}
                                aria-label="Move down"
                                title="Move down"
                              >
                                <ArrowDown className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>

                          <div className="col-span-4">
                            {entityType === 'cluster' ? (
                              loadingZonesForCluster ? (
                                <div className="text-xs text-muted-foreground italic px-2">Loading zones...</div>
                              ) : (
                                <select
                                  key={`cluster-select-${row.id}`}
                                  className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                                  value={row.farmerId}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    config.setLandRows(prev => prev.map(r => {
                                      if (r.id === row.id) {
                                        const zn = availableZonesForCluster.find(z => z.zone_id === val);
                                        return {
                                          ...r,
                                          farmerId: val,
                                          fetchedDetails: zn ? `${zn.total_area} Acres` : null,
                                          village: zn?.zone_name || ''
                                        };
                                      }
                                      return r;
                                    }));
                                  }}
                                >
                                  <option value="">Select Zone</option>
                                  {(() => {
                                    const selectedIds = config.landRows.map(r => r.farmerId).filter(Boolean) as string[];
                                    const options = availableZonesForCluster.filter(z => z.zone_id === row.farmerId || !selectedIds.includes(z.zone_id));
                                    return options.map(z => (
                                      <option key={z.zone_id} value={z.zone_id}>{z.zone_name}</option>
                                    ));
                                  })()}
                                </select>
                              )
                            ) : entityType === 'zone' ? (
                              loadingBlocksForZone ? (
                                <div className="text-xs text-muted-foreground italic px-2">Loading blocks...</div>
                              ) : (
                                <select
                                  key={`zone-select-${row.id}`}
                                  className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                                  value={row.farmerId}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    config.setLandRows(prev => prev.map(r => {
                                      if (r.id === row.id) {
                                        const blk = availableBlocksForZone.find(b => b.block_id === val);
                                        return {
                                          ...r,
                                          farmerId: val,
                                          fetchedDetails: blk ? `${blk.total_area} Acres` : null,
                                          village: blk?.block_name || ''
                                        };
                                      }
                                      return r;
                                    }));
                                  }}
                                >
                                  <option value="">Select Block</option>
                                  {(() => {
                                    const selectedIds = config.landRows.map(r => r.farmerId).filter(Boolean) as string[];
                                    const options = availableBlocksForZone.filter(b => b.block_id === row.farmerId || !selectedIds.includes(b.block_id));
                                    return options.map(b => (
                                      <option key={b.block_id} value={b.block_id}>{b.block_name}</option>
                                    ));
                                  })()}
                                </select>
                              )
                            ) : (
                              loadingFarmsForEntity ? (
                                <div className="text-xs text-muted-foreground italic px-2">Loading farmers...</div>
                              ) : (
                                <select
                                  key={`farmer-select-${row.id}`}
                                  className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                                  value={row.farmerId}
                                  onChange={(e) => handleLandChange(row.id, 'farmerId', e.target.value, config.landRows, config.setLandRows)}
                                >
                                  <option value="">Select Farmer</option>
                                  {availableFarms.map(f => (
                                    <option key={f.id} value={f.id}>{f.fullName}</option>
                                  ))}
                                </select>
                              )
                            )}
                          </div>

                          <div className="col-span-3">
                            {row.fetchedDetails ? (
                              <div className="text-sm px-3 py-2 bg-[#0D3A35]/5 text-[#0D3A35] rounded-md border border-[#0D3A35]/15 flex items-center gap-2">
                                <Map className="w-3 h-3" />
                                <span className="truncate">{row.fetchedDetails}</span>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground italic px-2">{entityType === 'zone' ? 'Select block to fetch' : 'Select farmer to fetch'}</span>
                            )}
                          </div>

                          <div className="col-span-3">
                            <div className="h-9 flex items-center px-3 bg-muted/30 rounded border border-input text-sm text-muted-foreground">
                              {row.village || <span className="italic text-xs">{entityType === 'zone' ? 'Select block' : 'Select farmer'}</span>}
                            </div>
                          </div>

                          <div className="col-span-1 flex items-center justify-center">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50"
                              onClick={() => removeLandRow(row.id, config.landRows, config.setLandRows)}
                              aria-label="Delete row"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {config.landRows.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
                      No rows added yet. Click "Add Row" to start.
                    </div>
                  )}
                </div>

                {/* Auto Priority */}
                <div className="flex justify-end pt-2">
                  <Button
                    variant="outline"
                    className="gap-2 text-[#0D3A35] border-[#0D3A35] hover:bg-[#0D3A35]/5 rounded-full shadow-md"
                    title="Auto Priority"
                    disabled={config.landRows.length === 0 || config.landRows.every(row => !row.farmerId)}
                    onClick={() => {
                      config.setLandRows(prev => {
                        const sorted = [...prev].sort((a, b) => {
                          const areaA = parseFloat(a.fetchedDetails?.split(' ')[0] || '0');
                          const areaB = parseFloat(b.fetchedDetails?.split(' ')[0] || '0');
                          return areaB - areaA;
                        });
                        return sorted;
                      });
                      toast({ title: 'Priority Set', description: 'Farms have been auto-prioritized by area.' });
                    }}
                  >
                    <Bot className="w-5 h-5" />
                    Auto Priority
                  </Button>
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => config.setIsModalOpen(false)}>Cancel</Button>
                  <Button
                    onClick={config.handleCreate}
                    className="bg-[#0D3A35] hover:bg-[#092b27]"
                    disabled={!config.entityName.trim() || config.landRows.length === 0 || config.landRows.every(row => !row.farmerId)}
                  >
                    Save {config.entityLabel}
                  </Button>
                </DialogFooter>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Entity List */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {entities.length === 0 ? (
            <div className="border border-dashed border-muted-foreground/30 rounded-xl p-8 flex flex-col items-center justify-center text-center h-64 bg-muted/5">
              {entityType === 'cluster' && <Grid3x3 className="w-12 h-12 text-muted-foreground mb-4 opacity-50" />}
              {entityType === 'zone' && <Building className="w-12 h-12 text-muted-foreground mb-4 opacity-50" />}
              {entityType === 'block' && <Map className="w-12 h-12 text-muted-foreground mb-4 opacity-50" />}
              <h3 className="font-semibold text-lg text-muted-foreground">No {config.entityLabel}s Created</h3>
              <p className="text-sm text-muted-foreground/80 mt-1 max-w-xs">
                Get started by clicking the "Create {config.entityLabel}" button above to group farmers into manageable {entityType}s.
              </p>
            </div>
          ) : (
            entities.map((entity) => (
              <div
                  key={entity[`${entityType}_id`]}
                  className="group bg-white border border-[#0D3A35]/15 rounded-2xl p-0 shadow-md hover:shadow-xl transition-shadow cursor-pointer relative overflow-hidden flex flex-col min-h-[180px]"
                  onClick={() => {
                    config.setViewEntity(entity);
                    if (entityType === 'block') {
                      setFarmsInBlock([]);
                      setLoadingFarmsInBlock(true);
                      const base = getBaseUrl();
                      fetch(`${base.replace(/\/$/, '')}/farmer_managment/get_farms_in_block/${entity.block_id}`, {
                        method: 'GET',
                        headers: { 'Content-Type': 'application/json' }
                      })
                        .then(async resp => {
                          if (!resp.ok) throw new Error(`Server responded ${resp.status}`);
                          const data = await resp.json();
                          setFarmsInBlock(Array.isArray(data.farms) ? data.farms : (data.farms || []));
                        })
                        .catch(err => {
                          console.error('Failed to load farms in block:', err);
                          setFarmsInBlock([]);
                          toast({ title: 'Error', description: 'Failed to load farms for this block', variant: 'destructive' });
                        })
                        .finally(() => setLoadingFarmsInBlock(false));
                    } else if (entityType === 'zone') {
                      setBlocksInZoneView({});
                      setLoadingBlocksInZoneView(true);
                      const base = getBaseUrl();
                      fetch(`${base.replace(/\/$/, '')}/farmer_managment/get_lands_in_zone/${entity.zone_id}`, {
                        method: 'GET',
                        headers: { 'Content-Type': 'application/json' },
                      })
                        .then(async (resp) => {
                          if (!resp.ok) throw new Error(`Server responded ${resp.status}`);
                          const data = await resp.json();
                          setBlocksInZoneView((data?.lands && typeof data.lands === 'object') ? data.lands : {});
                        })
                        .catch((err) => {
                          console.error('Failed to load lands in zone:', err);
                          setBlocksInZoneView({});
                          toast({ title: 'Error', description: 'Failed to load lands for this zone', variant: 'destructive' });
                        })
                        .finally(() => setLoadingBlocksInZoneView(false));
                    } else {
                      setFarmsInBlock([]);
                    }
                    config.setIsViewModalOpen(true);
                  }}
                >
                <div className="h-1.5 w-full bg-[#0D3A35]" />
                <div className="flex-1 flex flex-col justify-between p-6">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-bold text-xl text-slate-950 truncate max-w-[70%] group-hover:text-[#0D3A35] transition-colors">
                        {entity[`${entityType}_name`] || entity[`${entityType}_id`]}
                      </h3>
                      <span className="text-xs text-[#0D3A35] bg-[#0D3A35]/10 px-2 py-1 rounded-full font-semibold tracking-wide shadow-sm border border-[#0D3A35]/20">
                        ID: {entity[`${entityType}_id`].slice(0, 8)}...
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-base font-medium text-[#0D3A35]">Total Area</span>
                      <span className="text-2xl font-extrabold text-slate-950 drop-shadow-sm">
                            {getEntityCardArea(entityType, entity)} <span className="text-base font-semibold">acres</span>
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-6">
                    <span className="text-xs text-muted-foreground">Click to view details</span>
                    <span className="inline-flex items-center gap-1 text-[#0D3A35] font-medium text-xs bg-[#0D3A35]/5 px-2 py-1 rounded-full border border-[#0D3A35]/15">
                      {entityType === 'cluster' && <Grid3x3 className="w-4 h-4 mr-1 text-[#0D3A35]/50" />}
                      {entityType === 'zone' && <Building className="w-4 h-4 mr-1 text-[#0D3A35]/50" />}
                      {entityType === 'block' && <Map className="w-4 h-4 mr-1 text-[#0D3A35]/50" />}
                      {config.entityLabel}
                    </span>
                  </div>
                </div>

                  {/* Zone Bottom Panel: Field Manager */}
                  {entityType === 'zone' && (
                    <div className="border-t border-[#0D3A35]/15 bg-[#0D3A35]/5 px-6 py-3">
                      {(() => {
                        const managers = zoneFieldManagers[String(entity.zone_id)] || [];
                        if (managers.length === 0) {
                          return (
                            <button
                              type="button"
                              className="w-full flex items-center justify-between gap-3 text-sm font-semibold text-[#0D3A35] hover:text-[#092b27]"
                              onClick={(e) => {
                                e.stopPropagation();
                                openAssignFieldManager(entity as Zone);
                              }}
                            >
                              <span className="inline-flex items-center gap-2">
                                <User className="w-4 h-4 text-[#0D3A35]" />
                                Assign field manager
                              </span>
                              <span className="text-xs text-[#0D3A35] bg-white/70 border border-[#0D3A35]/20 px-2 py-0.5 rounded-full">Assign</span>
                            </button>
                          );
                        }

                        return (
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <BadgeCheck className="w-4 h-4 text-[#0D3A35]" />
                                <p className="text-xs uppercase font-bold tracking-wide text-[#0D3A35]">Field Manager</p>
                              </div>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {managers.map((manager) => (
                                  <div key={manager.staff_id} className="inline-flex items-center gap-2 rounded-full border border-[#0D3A35]/20 bg-white px-3 py-1 text-xs font-semibold text-slate-950 shadow-sm">
                                    <span>{manager.name}</span>
                                    <span className="text-[10px] font-medium text-[#0D3A35]">{manager.manager_id}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                            <button
                              type="button"
                              className="shrink-0 text-xs font-semibold text-[#0D3A35] bg-white/80 border border-[#0D3A35]/20 px-3 py-1 rounded-full hover:bg-white"
                              onClick={(e) => {
                                e.stopPropagation();
                                openAssignFieldManager(entity as Zone);
                              }}
                            >
                              Change
                            </button>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* Block Bottom Panel: Supervisor */}
                  {entityType === 'block' && (
                    <div className="border-t border-[#0D3A35]/15 bg-[#0D3A35]/5 px-6 py-3">
                      {(() => {
                        const supervisor = blockSupervisors[String(entity.block_id)];
                        if (!supervisor) {
                          return (
                            <button
                              type="button"
                              className="w-full flex items-center justify-between gap-3 text-sm font-semibold text-[#0D3A35] hover:text-[#092b27]"
                              onClick={(e) => {
                                e.stopPropagation();
                                openAssignSupervisor(entity as Block);
                              }}
                            >
                              <span className="inline-flex items-center gap-2">
                                <User className="w-4 h-4 text-[#0D3A35]" />
                                Assign supervisor
                              </span>
                              <span className="text-xs text-[#0D3A35] bg-white/70 border border-[#0D3A35]/20 px-2 py-0.5 rounded-full">Assign</span>
                            </button>
                          );
                        }

                        return (
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <BadgeCheck className="w-4 h-4 text-[#0D3A35]" />
                                <p className="text-xs uppercase font-bold tracking-wide text-[#0D3A35]">Supervisor</p>
                              </div>
                              <p className="mt-1 text-sm font-semibold text-slate-900 truncate">{supervisor.name}</p>
                              <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
                                <span className="inline-flex items-center gap-1"><User className="w-3 h-3" />{supervisor.supervisor_id}</span>
                                <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" />{supervisor.phone}</span>
                              </div>
                            </div>
                            <button
                              type="button"
                              className="shrink-0 text-xs font-semibold text-[#0D3A35] bg-white/80 border border-[#0D3A35]/20 px-3 py-1 rounded-full hover:bg-white"
                              onClick={(e) => {
                                e.stopPropagation();
                                openAssignSupervisor(entity as Block);
                              }}
                            >
                              Change
                            </button>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                <div className="absolute right-0 bottom-0 opacity-10 pointer-events-none">
                  {entityType === 'cluster' && <Grid3x3 className="w-32 h-32 text-[#0D3A35]" />}
                  {entityType === 'zone' && <Building className="w-32 h-32 text-[#0D3A35]" />}
                  {entityType === 'block' && <Map className="w-32 h-32 text-[#0D3A35]" />}
                </div>
              </div>
            ))
          )}
        </div>

          {/* Assign Field Manager Dialog (Zones only) */}
          {entityType === 'zone' && (
            <Dialog
              open={isAssignManagerOpen}
              onOpenChange={(open) => {
                setIsAssignManagerOpen(open);
                if (!open) {
                  setAssigningZone(null);
                  setSelectedManagerIds([]);
                }
              }}
            >
              <DialogContent className="max-w-xl">
                <DialogHeader>
                  <DialogTitle className="text-xl font-bold">Assign Field Manager</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="bg-muted/30 border border-border rounded-lg px-4 py-3">
                    <div className="text-xs text-muted-foreground">Zone</div>
                    <div className="text-sm font-semibold text-foreground">
                      {assigningZone?.zone_name || assigningZone?.zone_id || '—'}
                    </div>
                  </div>

                  <div className="bg-[#0D3A35]/5 border border-[#0D3A35]/20 rounded-lg px-4 py-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#0D3A35] mb-2">Selected Managers</div>
                    {selectedManagerIds.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {selectedManagerIds.map((id) => {
                          const manager = fieldManagers.find((item) => item.manager_id === id);
                          return (
                            <span key={id} className="inline-flex items-center gap-2 rounded-full bg-white border border-[#0D3A35]/20 px-3 py-1 text-xs font-semibold text-slate-950">
                              <User className="w-3 h-3 text-[#0D3A35]" />
                              {manager?.name || id}
                            </span>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-sm text-[#0D3A35]/70">No field managers selected yet.</div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="text-sm font-semibold text-foreground">Select one or more managers</div>
                    <div className="space-y-2">
                      {isLoadingFieldManagers ? (
                        <div className="text-sm text-muted-foreground italic px-1">Loading field managers...</div>
                      ) : fieldManagersError ? (
                        <div className="text-sm text-red-600 px-1">{fieldManagersError}</div>
                      ) : fieldManagers.length === 0 ? (
                        <div className="text-sm text-muted-foreground italic px-1">No field managers found.</div>
                      ) : (
                        fieldManagers.map((m) => (
                          <label
                            key={m.manager_id}
                            className={
                              'flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/20 ' +
                              (selectedManagerIds.includes(m.manager_id) ? 'border-[#0D3A35]/50 bg-[#0D3A35]/5' : 'border-border bg-white')
                            }
                          >
                            <input
                              type="checkbox"
                              checked={selectedManagerIds.includes(m.manager_id)}
                              onChange={() => {
                                setSelectedManagerIds((prev) =>
                                  prev.includes(m.manager_id)
                                    ? prev.filter((id) => id !== m.manager_id)
                                    : [...prev, m.manager_id]
                                );
                              }}
                              className="mt-1"
                            />
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-foreground truncate">{m.name}</div>
                              <div className="mt-0.5 text-[11px] text-muted-foreground flex flex-wrap gap-3">
                                <span className="inline-flex items-center gap-1"><User className="w-3 h-3" />{m.manager_id}</span>
                                <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" />{m.phone}</span>
                              </div>
                            </div>
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsAssignManagerOpen(false)}>Cancel</Button>
                  <Button
                    className="bg-[#0D3A35] hover:bg-[#092b27]"
                    onClick={confirmAssignFieldManager}
                    disabled={!assigningZone || selectedManagerIds.length === 0 || isLoadingFieldManagers || isAssigningFieldManager || fieldManagers.length === 0}
                  >
                    {isAssigningFieldManager ? 'Saving…' : 'Save Selection'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

          {/* Assign Supervisor Dialog (Blocks only) */}
          {entityType === 'block' && (
            <Dialog
              open={isAssignSupervisorOpen}
              onOpenChange={(open) => {
                setIsAssignSupervisorOpen(open);
                if (!open) {
                  setAssigningBlock(null);
                  setSelectedSupervisorId('');
                  setSupervisorsError(null);
                  setIsAssigningSupervisor(false);
                }
              }}
            >
              <DialogContent className="max-w-xl">
                <DialogHeader>
                  <DialogTitle className="text-xl font-bold">Assign Supervisor</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="bg-muted/30 border border-border rounded-lg px-4 py-3">
                    <div className="text-xs text-muted-foreground">Block</div>
                    <div className="text-sm font-semibold text-foreground">
                      {assigningBlock?.block_name || assigningBlock?.block_id || '—'}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="text-sm font-semibold text-foreground">Select a supervisor</div>
                    <div className="space-y-2">
                      {isLoadingSupervisors ? (
                        <div className="text-sm text-muted-foreground italic px-1">Loading supervisors...</div>
                      ) : supervisorsError ? (
                        <div className="text-sm text-red-600 px-1">{supervisorsError}</div>
                      ) : supervisors.length === 0 ? (
                        <div className="text-sm text-muted-foreground italic px-1">No supervisors found.</div>
                      ) : (
                        supervisors.map((s) => (
                          <label
                            key={s.supervisor_id}
                            className={
                              'flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/20 ' +
                              (selectedSupervisorId === s.supervisor_id ? 'border-[#0D3A35]/50 bg-[#0D3A35]/5' : 'border-border bg-white')
                            }
                          >
                            <input
                              type="radio"
                              name="supervisor"
                              checked={selectedSupervisorId === s.supervisor_id}
                              onChange={() => setSelectedSupervisorId(s.supervisor_id)}
                              className="mt-1"
                            />
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-foreground truncate">{s.name}</div>
                              <div className="mt-0.5 text-[11px] text-muted-foreground flex flex-wrap gap-3">
                                <span className="inline-flex items-center gap-1"><User className="w-3 h-3" />{s.supervisor_id}</span>
                                <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" />{s.phone}</span>
                              </div>
                            </div>
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsAssignSupervisorOpen(false)} disabled={isAssigningSupervisor}>
                    Cancel
                  </Button>
                  <Button
                    className="bg-[#0D3A35] hover:bg-[#092b27]"
                    onClick={confirmAssignSupervisor}
                    disabled={
                      !assigningBlock ||
                      !selectedSupervisorId ||
                      isLoadingSupervisors ||
                      isAssigningSupervisor ||
                      supervisors.length === 0
                    }
                  >
                    {isAssigningSupervisor ? 'Assigning…' : 'Assign'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

        {/* View Entity Modal */}
        <Dialog open={config.isViewModalOpen} onOpenChange={(open) => {
          config.setIsViewModalOpen(open);
          if (!open) {
            setFarmsInBlock([]);
            setBlocksInZoneView({});
          }
        }}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold">View {config.entityLabel}</DialogTitle>
            </DialogHeader>

            {config.viewEntity && (
              <div className="space-y-6 py-4">
                <div className="flex gap-4 items-end">
                  <div className="flex-1 space-y-2">
                    <label className="text-sm font-medium">{config.entityLabel} Name</label>
                    <Input value={config.viewEntity[`${entityType}_name`] || ''} readOnly className="bg-muted/30" />
                  </div>
                  <div className="mb-1">
                    <div className="bg-muted/50 border border-border rounded-lg px-6 py-3 flex flex-col items-center min-w-[120px]">
                      <span className="text-xs text-muted-foreground mb-1">Total Area</span>
                      <span className="text-xl font-bold">{getViewTotalArea()} acres</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    {entityType === 'zone' ? 'Lands in Zone grouped by Block' : `Farms in ${config.entityLabel}`}
                  </label>
                  <div className="bg-muted/20 border rounded-lg p-4 min-h-[60px]">
                    {entityType === 'zone' ? (
                      loadingBlocksInZoneView ? (
                        <div className="text-sm text-muted-foreground italic">Loading lands...</div>
                      ) : Object.keys(blocksInZoneView).length === 0 ? (
                        <div className="text-sm text-muted-foreground italic">No lands found for this zone.</div>
                      ) : (
                        <div className="space-y-4">
                          <div className="flex items-center justify-between gap-3 mb-2">
                            <div className="text-sm text-muted-foreground">
                              {Object.values(blocksInZoneView).reduce((count, lands) => count + lands.length, 0)} lands across {Object.keys(blocksInZoneView).length} blocks.
                            </div>
                            <div className="text-sm font-semibold text-[#0D3A35] bg-[#0D3A35]/5 px-3 py-1 rounded-full border border-[#0D3A35]/15">
                              Total Land Area: {getZoneViewTotalArea()} acres
                            </div>
                          </div>

                          {Object.entries(blocksInZoneView).map(([blockId, lands]) => {
                            const blockName = blocks.find((block) => block.block_id === blockId)?.block_name || blockId;

                            return (
                              <div key={blockId} className="border rounded-lg bg-white overflow-hidden">
                                <div className="flex items-center justify-between px-4 py-3 bg-muted/40 border-b">
                                  <div>
                                    <div className="text-sm font-semibold text-foreground">Block: {blockName}</div>
                                    <div className="text-xs text-muted-foreground">{lands.length} land{lands.length === 1 ? '' : 's'}</div>
                                  </div>
                                  <div className="text-sm font-semibold text-[#0D3A35]">
                                    {lands.reduce((sum, land) => sum + Number(land?.area ?? 0), 0)} acres
                                  </div>
                                </div>

                                <div className="divide-y">
                                  {lands.map((land, index) => (
                                    <div key={land.farm_id || `${blockId}-${index}`} className="px-4 py-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                                      <div>
                                        <div className="text-xs text-muted-foreground uppercase tracking-wide">Farm</div>
                                        <div className="text-sm font-semibold text-foreground break-all">{land.farm_id || 'N/A'}</div>
                                        <div className="text-xs text-muted-foreground break-all">Farmer: {land.farmer_id || 'N/A'}</div>
                                      </div>
                                      <div>
                                        <div className="text-xs text-muted-foreground uppercase tracking-wide">Land Details</div>
                                        <div className="text-sm text-foreground">{land.land_data?.village || 'N/A'}</div>
                                        <div className="text-xs text-muted-foreground">{land.land_data?.district || 'N/A'}, {land.land_data?.state || 'N/A'}</div>
                                      </div>
                                      <div className="md:text-right">
                                        <div className="text-xs text-muted-foreground uppercase tracking-wide">Area</div>
                                        <div className="text-sm font-semibold text-foreground">{Number(land.area ?? 0)} acres</div>
                                        <div className="text-xs text-muted-foreground">Priority: {land.priority ?? '-'}</div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )
                    ) : entityType === 'block' ? (
                      isAddingBlockLands ? (
                        <div className="space-y-4">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold">Add Land</div>
                              <div className="text-xs text-muted-foreground">Select a new farm and set its priority.</div>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-2"
                              onClick={() =>
                                addLandRow(blockLandEditorRows, setBlockLandEditorRows)
                              }
                            >
                              <Plus className="w-4 h-4" /> Add Row
                            </Button>
                          </div>

                          <div className="border rounded-lg overflow-hidden bg-white">
                            <div className="grid grid-cols-12 gap-3 p-3 bg-muted/50 border-b text-xs font-medium text-muted-foreground">
                              <div className="col-span-1 text-center">#</div>
                              <div className="col-span-1 text-center">Priority</div>
                              <div className="col-span-4">Farmer Name</div>
                              <div className="col-span-4">Details</div>
                              <div className="col-span-1 text-center">Move</div>
                              <div className="col-span-1 text-center">Del</div>
                            </div>

                            <div className="divide-y">
                              {blockLandEditorRows.map((row, index) => (
                                <div key={row.id} className="grid grid-cols-12 gap-3 p-3 items-center">
                                  <div className="col-span-1 text-center text-sm text-muted-foreground">{index + 1}</div>
                                  <div className="col-span-1">
                                    <Input
                                      type="number"
                                      min={0}
                                      value={row.priority ?? index}
                                      onChange={(e) => handleLandChange(row.id, 'priority', e.target.value, blockLandEditorRows, setBlockLandEditorRows)}
                                      className="h-9"
                                    />
                                  </div>
                                  <div className="col-span-4">
                                    {row.isNew ? (
                                      <select
                                        className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                                        value={row.farmerId}
                                        onChange={(e) => handleLandChange(row.id, 'farmerId', e.target.value, blockLandEditorRows, setBlockLandEditorRows)}
                                      >
                                        <option value="">Select Farmer</option>
                                        {availableFarms
                                          .filter((farm) => !blockLandEditorRows.some((existingRow) => existingRow.farmerId === String(farm.id) && existingRow.id !== row.id))
                                          .map((farm) => (
                                            <option key={farm.id} value={farm.id}>{farm.fullName}</option>
                                          ))}
                                      </select>
                                    ) : (
                                      <Input
                                        value={row.farmerName || ''}
                                        readOnly
                                        className="h-9 bg-muted/30"
                                        placeholder="Farmer name"
                                      />
                                    )}
                                  </div>
                                  <div className="col-span-4 text-xs text-muted-foreground">
                                    {row.fetchedDetails || 'Select a farmer'}
                                  </div>
                                  <div className="col-span-1 flex justify-center">
                                    <div className="flex flex-col">
                                      <Button variant="ghost" size="icon" className="h-7 w-7" disabled={index === 0} onClick={() => moveEditorRow(row.id, 'up')}>
                                        <ArrowUp className="w-4 h-4" />
                                      </Button>
                                      <Button variant="ghost" size="icon" className="h-7 w-7" disabled={index === blockLandEditorRows.length - 1} onClick={() => moveEditorRow(row.id, 'down')}>
                                        <ArrowDown className="w-4 h-4" />
                                      </Button>
                                    </div>
                                  </div>
                                  <div className="col-span-1 flex justify-center">
                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => removeBlockEditorRow(row)}>
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="flex items-center justify-end gap-3">
                            <Button variant="outline" onClick={() => setIsAddingBlockLands(false)}>
                              Back
                            </Button>
                            <Button className="bg-[#0D3A35] hover:bg-[#092b27]" onClick={async () => {
                              try {
                                const base = getBaseUrl();
                                const payload = buildBlockUpdatePayload();
                                const resp = await fetch(`${base.replace(/\/$/, '')}/farmer_managment/update_block`, {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify(payload),
                                });

                                if (!resp.ok) {
                                  throw new Error(`Server responded ${resp.status}`);
                                }

                                toast({ title: 'Success', description: 'Block updated successfully.' });
                                setIsAddingBlockLands(false);
                                setFarmsInBlock((prev) => {
                                  const removedIds = new Set(
                                    blockLandOriginalRows
                                      .filter((row) => row.farmerId && !blockLandEditorRows.some((current) => current.farmerId === row.farmerId))
                                      .map((row) => row.farmerId)
                                  );
                                  return prev.filter((farm) => !removedIds.has(String(farm.farmer_id)));
                                });
                                loadBlocks();
                              } catch (error) {
                                console.error('Failed to update block:', error);
                                toast({ title: 'Error', description: 'Failed to update block', variant: 'destructive' });
                              }
                            }}>
                              Save
                            </Button>
                          </div>
                        </div>
                      ) : loadingFarmsInBlock ? (
                        <div className="text-sm text-muted-foreground italic">Loading farms...</div>
                      ) : (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between gap-3 mb-2">
                            <div className="text-sm text-muted-foreground">
                              {farmsInBlock.length === 0 ? 'No farms found for this block.' : `${farmsInBlock.length} farms in this block.`}
                            </div>
                            <Button
                              size="sm"
                              className="gap-2 bg-[#0D3A35] hover:bg-[#092b27]"
                              onClick={openAddLandEditor}
                            >
                              <Plus className="w-4 h-4" /> Add Land
                            </Button>
                          </div>

                          {farmsInBlock.length === 0 ? (
                            <div className="text-sm text-muted-foreground italic">No farms found for this block.</div>
                          ) : (
                            <div className="grid grid-cols-1 gap-3">
                              {farmsInBlock.map((f: any) => (
                                <div key={f.farm_id} className="p-3 border rounded-md bg-white/60 flex items-center justify-between">
                                  <div>
                                    <div className="font-semibold text-sm">Farm ID: {f.farm_id}</div>
                                    <div className="text-xs text-muted-foreground">Farmer ID: {f.farmer_id}</div>
                                    <div className="text-xs mt-1">Area: {f.area ?? f.area === 0 ? `${f.area} acres` : 'N/A'}</div>
                                    <div className="text-xs">Village: {f.land_data?.village || f.land_data?.village || 'N/A'}</div>
                                  </div>
                                  <div className="text-right text-xs text-muted-foreground">
                                    <div>Priority: {f.priority ?? '-'}</div>
                                    <div className="mt-2">Created: {f.created_at ? new Date(f.created_at).toLocaleDateString() : '-'}</div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    ) : (
                      <div className="text-muted-foreground">(Farmer list UI goes here)</div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => config.setIsViewModalOpen(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }
};

export default Blocks;
