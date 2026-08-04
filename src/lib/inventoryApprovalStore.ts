export type InventoryApprovalStatus = 'pending' | 'approved' | 'rejected';

export type InventoryTransferApproval = {
  id: string;
  approvalType: 'stock-transfer';
  title: string;
  status: InventoryApprovalStatus;
  requestedAt: string;
  approvedAt?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  digitalSignature?: {
    signerId: string;
    signerName: string;
    signerDesignation: string;
    signedAt: string;
    signature: string;
  };
  preparedBy: string;
  preparedById: string;
  approverId: string;
  approverName: string;
  approverDesignation: string;
  questions?: {
    id: string;
    askedAt: string;
    askedBy: string;
    question: string;
    reply?: string;
    repliedAt?: string;
    repliedBy?: string;
  }[];
  transfer: {
    transferSlipNumber: string;
    transferDate: string;
    sourceStore: string;
    destinationStore: string;
    expectedArrival: string;
    itemId: string;
    itemName: string;
    itemCode: string;
    category: string;
    unit: string;
    quantity: number;
    availableStock: number;
    vehicleId: string;
    vehicleNumber: string;
    vehicleType: string;
    vehicleMake: string;
    vehicleModel: string;
    driverName: string;
    driverContact: string;
    remarks: string;
  };
};

const INVENTORY_APPROVALS_KEY = 'farm-connect.inventory-approvals.v1';
const INVENTORY_APPROVALS_EVENT = 'farm-connect:inventory-approvals-updated';

export const readInventoryApprovals = (): InventoryTransferApproval[] => {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(INVENTORY_APPROVALS_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeInventoryApprovals = (records: InventoryTransferApproval[]) => {
  window.localStorage.setItem(INVENTORY_APPROVALS_KEY, JSON.stringify(records));
  window.dispatchEvent(new CustomEvent(INVENTORY_APPROVALS_EVENT));
};

export const createInventoryApproval = (
  approval: Omit<InventoryTransferApproval, 'id' | 'status' | 'requestedAt'>,
) => {
  const record: InventoryTransferApproval = {
    ...approval,
    id: `INV-APR-${Date.now()}-${Math.random().toString(16).slice(2, 8).toUpperCase()}`,
    status: 'pending',
    requestedAt: new Date().toISOString(),
  };
  writeInventoryApprovals([record, ...readInventoryApprovals()]);
  return record;
};

export const updateInventoryApproval = (
  id: string,
  update: Partial<Pick<
    InventoryTransferApproval,
    'status' | 'approvedAt' | 'rejectedAt' | 'rejectionReason' | 'questions' | 'digitalSignature'
  >>,
) => {
  const records = readInventoryApprovals().map((record) =>
    record.id === id ? { ...record, ...update } : record
  );
  writeInventoryApprovals(records);
  return records.find((record) => record.id === id) ?? null;
};

export const subscribeToInventoryApprovals = (listener: () => void) => {
  window.addEventListener(INVENTORY_APPROVALS_EVENT, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(INVENTORY_APPROVALS_EVENT, listener);
    window.removeEventListener('storage', listener);
  };
};
