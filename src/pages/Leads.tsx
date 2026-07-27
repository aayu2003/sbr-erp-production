import { useState, useEffect } from 'react';
import { Plus, Search, Filter, Users, Phone, BadgeCheck, UserCheck, UserX, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Lead } from '@/types/farm';
import getBaseUrl from '@/lib/config';
import LeadsTable from '@/components/leads/LeadsTable';
import AddLeadModal, { AddLeadFormData } from '@/components/leads/AddLeadModal';
import VerificationModal from '@/components/leads/VerificationModal';
import KYCModal from '@/components/leads/KYCModal';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

const Leads = () => {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTab, setSelectedTab] = useState<'general' | 'follow_up' | 'rejected'>('general');
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [verifyModalOpen, setVerifyModalOpen] = useState(false);
  const [kycModalOpen, setKycModalOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Lead | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadLeads();
  }, []);

  const loadLeads = async () => {
    try {
      const base = getBaseUrl();
      const resp = await fetch(`${base.replace(/\/$/, '')}/farmer_managment/get_leads`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!resp.ok) throw new Error(`Server responded with ${resp.status}`);

      const result = await resp.json();
      console.log('Raw API response:', result); // Debug log
      
      // Transform backend response to Lead interface
      const transformedLeads: Lead[] = (result.leads || []).map((item: any) => {
        // Defensive checks for farmer_data
        const farmer = item.farmer_data || {};
        return {
          id: String(item.lead_id),
          backendId: String(item.lead_id),
          farmerId: item.farmer_id,
          fullName: farmer.full_name || 'N/A',
          phoneNumber: farmer.phone_number || 'N/A',
          alternatePhone: farmer.alternate_phone_number,
          leadSource: farmer.lead_source || 'N/A',
          farmingOption: farmer.farming_option,
          village: farmer.village || 'N/A',
          // Keep taluka for backward compatibility, but prefer tehsil if provided by backend
          taluka: farmer.taluka,
          tehsil: farmer.tehsil || farmer.taluka || undefined,
          district: farmer.district || 'N/A',
          state: farmer.state || 'N/A',
          estimatedLandArea: farmer.estimated_land_area,
          waterAvailable: farmer.water_available,
          notes: farmer.note,
          landCoordinates: farmer.land_coordinates,
          status: item.status,
          createdAt: item.created_at,
          kycData: item.kyc_data,
          agreementData: item.agreement_data,
        };
      });

      setLeads(transformedLeads);
      toast({
        title: 'Success',
        description: `Loaded ${transformedLeads.length} leads from backend`,
      });
    } catch (error) {
      console.error('Failed to load leads:', error);
      toast({
        title: 'Error',
        description: `Failed to load leads: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: 'destructive',
      });
      setLeads([]); // Show empty list, no fallback to mock
    } finally {
      setLoading(false);
    }
  };

  const handleAddLead = async (data: AddLeadFormData) => {
    try {
      // Lead creation is now handled inside AddLeadModal workflow:
      // 1) upload images, 2) upload video, 3) call lead_contacted.
      // Here we only refresh list after successful modal submission.
      await loadLeads();
    } catch (error) {
      toast({
        title: 'Error',
        description: `Lead saved but refresh failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: 'destructive',
      });
    }
  };

  const handleProceed = (lead: Lead) => {
    setSelectedLead(lead);
    if (lead.status === 'contacted') {
      setVerifyModalOpen(true);
    } else if (lead.status === 'verified' || lead.status === 'follow_up') {
      setKycModalOpen(true);
    }
  };

  const handleVerify = async () => {
    if (!selectedLead) return;
    try {
      const base = getBaseUrl();
      const leadId = selectedLead.backendId || selectedLead.id;
      const resp = await fetch(`${base.replace(/\/$/, '')}/farmer_managment/verify_lead`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: leadId }),
      });
      console.log('lead_id:', leadId);

      if (!resp.ok) throw new Error(`Server responded ${resp.status}`);

      const result = await resp.json();
      if (result.success) {
        setLeads(prev =>
          prev.map(l => (l.id === selectedLead.id ? { ...l, status: 'verified' as const } : l))
        );
        toast({
          title: 'Success',
          description: 'Lead verified successfully',
        });
        setVerifyModalOpen(false);
      } else {
        throw new Error('Server returned success: false');
      }
    } catch (error) {
      console.error('Verify error:', error);
      toast({
        title: 'Error',
        description: `Failed to verify lead: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: 'destructive',
      });
    }
  };

  const handleReject = async () => {
    if (!selectedLead) return;
    try {
      const base = getBaseUrl();
      const leadId = selectedLead.backendId || selectedLead.id;
      const resp = await fetch(`${base.replace(/\/$/, '')}/farmer_managment/reject_lead`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: leadId }),
      });

      if (!resp.ok) throw new Error(`Server responded ${resp.status}`);

      const result = await resp.json();
      if (result.success) {
        setLeads(prev =>
          prev.map(l => (l.id === selectedLead.id ? { ...l, status: 'rejected' as const } : l))
        );
        toast({
          title: 'Lead Rejected',
          description: 'The lead has been rejected',
        });
        setVerifyModalOpen(false);
      } else {
        throw new Error('Server returned success: false');
      }
    } catch (error) {
      console.error('Reject error:', error);
      toast({
        title: 'Error',
        description: `Failed to reject lead: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: 'destructive',
      });
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const base = getBaseUrl();
      const leadId = deleteTarget.backendId || deleteTarget.id;
      const resp = await fetch(`${base.replace(/\/$/, '')}/farmer_managment/delete_lead`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: leadId }),
      });

      if (!resp.ok) throw new Error(`Server responded ${resp.status}`);

      const result = await resp.json();
      if (!result.success) throw new Error('Server returned success: false');

      setLeads(prev => prev.filter(l => l.id !== deleteTarget.id));
      toast({ title: 'Lead Deleted', description: `${deleteTarget.fullName} has been removed` });
      setDeleteTarget(null);
    } catch (error) {
      console.error('Delete error:', error);
      toast({
        title: 'Error',
        description: `Failed to delete lead: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleFollowUp = async (note: string) => {
    if (!selectedLead) return;
    try {
      const base = getBaseUrl();
      const payload = {
        lead_id: String(selectedLead.backendId || selectedLead.id),
        follow_up_note: note,
      };

      const resp = await fetch(`${base.replace(/\/$/, '')}/farmer_managment/followup_lead`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!resp.ok) throw new Error(`Server responded ${resp.status}`);

      const result = await resp.json();
      if (result.success) {
        setLeads(prev =>
          prev.map(l => (l.id === selectedLead.id ? { ...l, status: 'follow_up' as const, notes: note } : l))
        );
        toast({ title: 'Follow Up', description: 'Lead moved to follow-up' });
        setVerifyModalOpen(false);
      } else {
        throw new Error('Server returned success: false');
      }
    } catch (error) {
      console.error('FollowUp error:', error);
      // Fallback to local update when network/backend fails
      setLeads(prev =>
        prev.map(l => (l.id === selectedLead.id ? { ...l, status: 'follow_up' as const, notes: note } : l))
      );
      toast({ title: 'Follow Up (offline)', description: 'Saved follow-up locally', variant: 'destructive' });
      setVerifyModalOpen(false);
    }
  };

  const handleKYCSubmit = async (kycData: {
    aadhaarNumber: string;
    aadhaarPhoto?: File | null;
    profilePhoto?: File | null;
    leaseRent?: number;
    panNumber: string;
    panPhoto?: File | null;
    address: string;
    bankName: string;
    accountNumber: string;
    ifscCode: string;
    passbookPhoto?: File | null;
    agreementFile?: File | null;
    agreementStart?: string;
    agreementEnd?: string;
    b1Record?: File | null;
    kisanBook?: File | null;
  }) => {
    if (!selectedLead) return;
    try {
      const base = getBaseUrl();

      // Build payload matching RegisterFarmerRequest (including lead_id)
      const leadId = selectedLead.backendId || selectedLead.id;
      const payload = {
        lead_id: String(leadId),
        adhar_number: kycData.aadhaarNumber,
        pan_numnber: kycData.panNumber,
        permanent_address: kycData.address,
        accound_number: kycData.accountNumber,
        IFSC_code: kycData.ifscCode,
        agreement_start_date: kycData.agreementStart || undefined,
        agreement_end_date: kycData.agreementEnd || undefined,
        lease_rent: kycData.leaseRent != null ? Number(kycData.leaseRent) : undefined,
      };

      const url = `${base.replace(/\/$/, '')}/farmer_managment/register_farmer`;

      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!resp.ok) throw new Error(`Server responded ${resp.status}`);

      const result = await resp.json();
      if (!result.success) throw new Error('Server returned success: false');

      // Attempt to extract farmer id returned by register API
      const farmerId = result.farmer_id || result.data?.farmer_id || result.data?.id || result.farmer?.id;
      if (!farmerId) throw new Error('Register succeeded but farmer_id not returned');

      // Upload documents (if present) to upload_documents endpoint using multipart/form-data
      const uploadUrl = `${base.replace(/\/$/, '')}/farmer_managment/upload_documents`;

      const uploads: Array<{
        file?: File | null;
        document_type: string;
        fieldName: string;
      }> = [
        { file: kycData.aadhaarPhoto, document_type: 'adhar_card', fieldName: 'aadhaarPhoto' },
        { file: kycData.profilePhoto, document_type: 'profile_photo', fieldName: 'profilePhoto' },
        { file: kycData.panPhoto, document_type: 'pand_card', fieldName: 'panPhoto' },
        { file: kycData.passbookPhoto, document_type: 'bank_passbook', fieldName: 'passbookPhoto' },
        { file: kycData.agreementFile, document_type: 'agreement', fieldName: 'agreementFile' },
        { file: kycData.b1Record, document_type: 'B1_record', fieldName: 'b1Record' },
        { file: kycData.kisanBook, document_type: 'kisan_book', fieldName: 'kisanBook' },
      ];

      const failedUploads: string[] = [];

      for (const u of uploads) {
        if (!u.file) continue;

        try {
          const fd = new FormData();
          fd.append('document_type', u.document_type);
          fd.append('farmer_id', String(farmerId));
          fd.append('doc', u.file, u.file.name);

          // Some FastAPI handlers expect non-file params as query parameters.
          // Send document_type and farmer_id as query params and file as multipart body.
          const params = new URLSearchParams({ document_type: u.document_type, farmer_id: String(farmerId) });
          const urlWithParams = `${uploadUrl}?${params.toString()}`;

          const r = await fetch(urlWithParams, {
            method: 'POST',
            body: fd,
          });

          if (!r.ok) {
            // try to read response body for FastAPI validation details
            let text = '';
            try {
              text = await r.text();
            } catch (readErr) {
              text = String(readErr);
            }
            throw new Error(`Upload responded ${r.status}: ${text}`);
          }

          const rr = await r.json();
          if (!rr.success) throw new Error('Upload returned success: false');
        } catch (err) {
          console.error(`Upload failed for ${u.fieldName}:`, err);
          failedUploads.push(u.fieldName);
        }
      }

      // Update UI state based on upload results
      setLeads(prev =>
        prev.map(l => (l.id === selectedLead.id ? { ...l, status: 'registered' as const } : l))
      );

      if (failedUploads.length === 0) {
        toast({ title: 'Success', description: 'Farmer registered and documents uploaded' });
      } else {
        toast({ title: 'Partial Success', description: `Registered but failed to upload: ${failedUploads.join(', ')}`, variant: 'destructive' });
      }

      setKycModalOpen(false);
    } catch (error) {
      console.error('KYC submission error:', error);
      toast({
        title: 'Error',
        description: `Failed to register farmer: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: 'destructive',
      });
    }
  };

  const filteredLeads = leads
    .filter(lead => {
      if (selectedTab === 'general') return ['contacted', 'verified'].includes(lead.status);
      if (selectedTab === 'follow_up') return lead.status === 'follow_up';
      if (selectedTab === 'rejected') return lead.status === 'rejected';
      return true;
    })
    .filter(lead =>
      lead.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.village.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.district.toLowerCase().includes(searchQuery.toLowerCase())
    );

  const stats = {
    total: leads.length,
    contacted: leads.filter(l => l.status === 'contacted').length,
    verified: leads.filter(l => l.status === 'verified').length,
    registered: leads.filter(l => l.status === 'registered').length,
    rejected: leads.filter(l => l.status === 'rejected').length,
  };

  const tabs: { key: typeof selectedTab; label: string }[] = [
    { key: 'general', label: 'General' },
    { key: 'follow_up', label: 'Follow Up' },
    { key: 'rejected', label: 'Rejected' },
  ];

  const statCards = [
    { label: 'Total Leads', value: stats.total, Icon: Users, tone: 'bg-blue-50 text-blue-700 ring-blue-100' },
    { label: 'Contacted', value: stats.contacted, Icon: Phone, tone: 'bg-amber-50 text-amber-700 ring-amber-100' },
    { label: 'Verified', value: stats.verified, Icon: BadgeCheck, tone: 'bg-emerald-50 text-emerald-700 ring-emerald-100' },
    { label: 'Registered', value: stats.registered, Icon: UserCheck, tone: 'bg-[#0D3A35]/10 text-[#0D3A35] ring-[#0D3A35]/20' },
    { label: 'Rejected', value: stats.rejected, Icon: UserX, tone: 'bg-rose-50 text-rose-700 ring-rose-100' },
  ];

  return (
    <div className="min-h-screen bg-[#fbfcfd] p-8 text-slate-900">
      {/* Header */}
      <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950">Leads</h1>
          <p className="mt-1 text-sm font-semibold text-slate-500">Manage farmer onboarding pipeline</p>
        </div>
        <button
          type="button"
          onClick={() => setAddModalOpen(true)}
          className="flex h-11 items-center gap-2 rounded-lg bg-[#0D3A35] px-4 text-sm font-bold text-white shadow-sm hover:bg-[#092b27]"
        >
          <Plus className="h-4 w-4" />
          Add Lead
        </button>
      </div>

      {/* Stats */}
      <section className="mt-7 grid gap-5 sm:grid-cols-2 xl:grid-cols-5">
        {statCards.map(({ label, value, Icon, tone }) => (
          <div key={label} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_14px_40px_rgba(15,23,42,0.05)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-slate-500">{label}</p>
                <p className="mt-3 text-3xl font-extrabold text-slate-950">{value}</p>
              </div>
              <div className={cn('flex h-12 w-12 items-center justify-center rounded-xl ring-1', tone)}>
                <Icon className="h-6 w-6" />
              </div>
            </div>
          </div>
        ))}
      </section>

      {/* Search, Tabs & Filter */}
      <div className="mt-7 flex flex-wrap items-center gap-3">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            placeholder="Search by name, village, or district..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="h-11 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-sm font-semibold text-slate-700 outline-none focus:border-[#0D3A35]"
          />
        </div>

        <div className="flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          {tabs.map(tab => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setSelectedTab(tab.key)}
              className={cn(
                'flex h-9 items-center rounded-lg px-4 text-sm font-extrabold transition',
                selectedTab === tab.key
                  ? 'bg-[#0D3A35] text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          className="inline-flex h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <Filter className="h-4 w-4" />
          Filter
        </button>
      </div>

      {/* Table */}
      <div className="mt-6">
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#0D3A35] border-t-transparent" />
          </div>
        ) : (
          <LeadsTable leads={filteredLeads} onRegister={handleProceed} onDelete={setDeleteTarget} />
        )}
      </div>

      {/* Modals */}
      <AddLeadModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSubmit={handleAddLead}
      />

      <VerificationModal
        open={verifyModalOpen}
        onClose={() => setVerifyModalOpen(false)}
        lead={selectedLead}
        onVerify={handleVerify}
        onReject={handleReject}
        onFollowUp={handleFollowUp}
      />

      <KYCModal
        open={kycModalOpen}
        onClose={() => setKycModalOpen(false)}
        lead={selectedLead}
        onSubmit={handleKYCSubmit}
      />

      <Dialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm bg-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold text-slate-950">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-rose-50">
                <AlertTriangle className="h-4.5 w-4.5 text-rose-600" />
              </span>
              Delete Lead
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm font-semibold text-slate-500">
            Are you sure you want to delete <span className="font-extrabold text-slate-800">{deleteTarget?.fullName}</span>? This cannot be undone.
          </p>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
              className="inline-flex h-10 items-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDeleteConfirm}
              disabled={deleting}
              className="inline-flex h-10 items-center rounded-lg bg-rose-600 px-4 text-sm font-bold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Leads;
