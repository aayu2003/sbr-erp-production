export type PoApprovalStatus = 'draft' | 'pending' | 'approved' | 'rejected';

export type PoApprovalQuestion = {
  id: string;
  question: string;
  askedBy: string;
  askedAt: string;
  reply?: string;
  repliedBy?: string;
  repliedAt?: string;
};

export type PoApprovalRecord = {
  id: string;
  poNumber: string;
  prNumber: string;
  comparisonId: string;
  vendorId: string;
  vendorName: string;
  itemDetails: Array<{ name: string; uom: string; quantity: number }>;
  status: PoApprovalStatus;
  createdAt: string;
  sentAt?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  revisionNo?: number;
  revisedAt?: string;
  purchaseFlowForwardedAt?: string;
  questions?: PoApprovalQuestion[];
};

const STORAGE_KEY = 'farmconnect.poApprovals.v1';
export const PO_APPROVALS_CHANGED_EVENT = 'farmconnect:po-approvals-changed';

export const readPoApprovals = (): PoApprovalRecord[] => {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writePoApprovals = (records: PoApprovalRecord[]) => {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  window.dispatchEvent(new CustomEvent(PO_APPROVALS_CHANGED_EVENT));
};

export const saveCreatedPoForApproval = (record: Omit<PoApprovalRecord, 'id' | 'status'>) => {
  const records = readPoApprovals();
  const existing = records.find((item) => item.poNumber === record.poNumber);
  const next: PoApprovalRecord = {
    ...(existing || {}),
    ...record,
    id: existing?.id || `po-approval-${Date.now()}`,
    status: existing?.status || 'draft',
  };
  writePoApprovals([next, ...records.filter((item) => item.poNumber !== record.poNumber)]);
  return next;
};

export const sendPoForFinanceApproval = (poNumber: string) => {
  const sentAt = new Date().toISOString();
  writePoApprovals(readPoApprovals().map((record) =>
    record.poNumber === poNumber
      ? { ...record, status: 'pending' as const, sentAt, reviewedAt: undefined, reviewedBy: undefined }
      : record
  ));
};

export const reviewPoApproval = (
  poNumber: string,
  status: Extract<PoApprovalStatus, 'approved' | 'rejected'>,
  reviewedBy: string,
) => {
  writePoApprovals(readPoApprovals().map((record) =>
    record.poNumber === poNumber
      ? { ...record, status, reviewedAt: new Date().toISOString(), reviewedBy }
      : record
  ));
};

export const markPoForwardedToPurchaseFlow = (poNumber: string) => {
  const forwardedAt = new Date().toISOString();
  writePoApprovals(readPoApprovals().map((record) =>
    record.poNumber === poNumber ? { ...record, purchaseFlowForwardedAt: forwardedAt } : record
  ));
  return forwardedAt;
};

export const markPoRevisedForApproval = (poNumber: string) => {
  let revisedRecord: PoApprovalRecord | null = null;
  const records = readPoApprovals().map((record) => {
    if (record.poNumber !== poNumber) return record;
    revisedRecord = {
      ...record,
      status: 'draft' as const,
      revisionNo: (record.revisionNo || 0) + 1,
      revisedAt: new Date().toISOString(),
      reviewedAt: undefined,
      reviewedBy: undefined,
    };
    return revisedRecord;
  });
  writePoApprovals(records);
  return revisedRecord;
};

export const addPoApprovalQuestion = (poNumber: string, question: string, askedBy: string) => {
  const cleanQuestion = question.trim();
  if (!cleanQuestion) return;
  writePoApprovals(readPoApprovals().map((record) =>
    record.poNumber === poNumber
      ? {
          ...record,
          questions: [
            ...(record.questions || []),
            {
              id: `po-question-${Date.now()}`,
              question: cleanQuestion,
              askedBy: askedBy.trim() || 'Admin Ops Finance',
              askedAt: new Date().toISOString(),
            },
          ],
        }
      : record
  ));
};

export const replyToPoApprovalQuestion = (
  poNumber: string,
  questionId: string,
  reply: string,
  repliedBy: string,
) => {
  const cleanReply = reply.trim();
  if (!cleanReply) return;
  writePoApprovals(readPoApprovals().map((record) =>
    record.poNumber === poNumber
      ? {
          ...record,
          questions: (record.questions || []).map((question) =>
            question.id === questionId
              ? {
                  ...question,
                  reply: cleanReply,
                  repliedBy: repliedBy.trim() || 'PO Creator',
                  repliedAt: new Date().toISOString(),
                }
              : question
          ),
        }
      : record
  ));
};
