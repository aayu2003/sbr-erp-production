import { useState, useEffect } from 'react';
import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { Sprout, LayoutDashboard, MapPin, ShoppingBag, Users, Wallet, Fuel, LogOut, Bell, X, ShieldOff } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { usePushNotification } from '@/hooks/usePushNotification';
import { getBaseUrl } from '@/lib/config';
import WebAppLogin from './WebAppLogin';
import HomePage     from './HomePage';
import LandsPage    from './LandsPage';
import PurchasePage from './PurchasePage';
import HRPage       from './HRPage';
import AccountsPage from './AccountsPage';
import FuelPage     from './FuelPage';

// ─────────────────────────────────────────────────────────────
// Shared types
// ─────────────────────────────────────────────────────────────

export type ApprovalCategory = 'lands' | 'purchase' | 'hr' | 'accounts';
export type ApprovalStatus   = 'pending' | 'approved' | 'rejected';

export interface LandDetails {
	images:  [string, string, string];
	videoUrl: string;
	mapping: {
		lat:          number;
		lng:          number;
		area:         string;
		surveyNo:     string;
		village:      string;
		district:     string;
		coordinates?: number[] | number[][];
	};
	owner: {
		name:    string;
		phone:   string;
		address: string;
	};
}

export interface IndentLineItem {
	id:                            string;
	srNo:                          number;
	itemCode:                      string;
	partName:                      string;
	specification:                 string;
	uom:                           string;
	totalQtyRequired:              number;
	lessQtyAvailableInStock:       number;
	procurementLeadTimeWeeks:      number;
	materialRequiredByDate:        string;
	indigenousOrImported:          'Indigenous' | 'Imported';
	ratePerItem:                   number;
	preferredVendorName:           string;
	validityOfWarrantyAndGuarantee: string;
	fullLifeHr:                    string;
	actualLifeHr:                  string;
	reasonForReplacement:          string;
	repairingPossibility:          'Yes' | 'No' | 'NA';
}

export interface IndentDetails {
	project:           string;
	indentedBy:        string;
	forwardedBy:       string;
	directorsApproval: string;
	remarksNotes:      string;
	budgetHead:        string;
	items:             IndentLineItem[];
}

export interface FinanceItem {
	srNo:    number;
	name:    string;
	qty:     number;
	uom:     string;
	rate?:   number;
	value:   number;
	gstAmt?: number;
}

export interface FinanceIndentData {
	indentType:  'Purchase Requisition' | 'Service Purchase Requisition';
	prNumber:    string;
	indentedBy:  string;
	forwardedBy: string;
	items:       FinanceItem[];
	total:       number;
	notes?:      string;
	department?: string;
	createdAt:   string;
}

export interface Approval {
	id:             string;
	category:       ApprovalCategory;
	subType:        string;
	title:          string;
	description:    string;
	requester:      string;
	department:     string;
	amount:         number | null;
	date:           string;
	status:         ApprovalStatus;
	priority:       'high' | 'medium' | 'low';
	landDetails?:   LandDetails;
	indentDetails?: IndentDetails;
	financeIndent?: FinanceIndentData;
}

export const CATEGORY_META: Record<ApprovalCategory, {
	label:   string;
	strip:   string;
	badge:   string;
	iconBg:  string;
	text:    string;
	lightBg: string;
	Icon:    React.ComponentType<{ className?: string }>;
}> = {
	lands:    { label: 'Lands',    strip: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 ring-emerald-200',  iconBg: 'bg-emerald-100', text: 'text-emerald-700', lightBg: 'bg-emerald-50', Icon: MapPin     },
	purchase: { label: 'Purchase', strip: 'bg-blue-500',    badge: 'bg-blue-50 text-blue-700 ring-blue-200',          iconBg: 'bg-blue-100',    text: 'text-blue-700',    lightBg: 'bg-blue-50',    Icon: ShoppingBag },
	hr:       { label: 'HR',       strip: 'bg-violet-500',  badge: 'bg-violet-50 text-violet-700 ring-violet-200',    iconBg: 'bg-violet-100',  text: 'text-violet-700',  lightBg: 'bg-violet-50',  Icon: Users       },
	accounts: { label: 'Accounts', strip: 'bg-amber-500',   badge: 'bg-amber-50 text-amber-700 ring-amber-200',       iconBg: 'bg-amber-100',   text: 'text-amber-700',   lightBg: 'bg-amber-50',   Icon: Wallet      },
};

// ─────────────────────────────────────────────────────────────
// API lead types + mapping helpers
// ─────────────────────────────────────────────────────────────

interface ApiLead {
	lead_id:    string;
	farmer_id:  string;
	status:     string;
	created_at: string;
	farmer_data: {
		full_name:              string;
		phone_number:           string;
		alternate_phone_number?: string | null;
		village?:               string;
		district?:              string;
		state?:                 string;
		taluka?:                string;
		tehsil?:                string;
		estimated_land_area:    number;
		farming_option:         string;
		lead_source?:           string;
		water_available?:       boolean;
		land_coordinates:       number[] | number[][];
		land_images?:           string[];
		land_video?:            string;
		note?:                  string | null;
	};
	kyc_data:             any;
	land_media?:          { images?: string[]; video?: string };
	agreement_data:       any;
	forwarded_directors?: { staff_id: string; staff_name: string; status: string }[];
}

const LAND_IMG_PLACEHOLDER = '/web-app-manifest-192x192.png';

function extractLatLng(coords: number[] | number[][]): [number, number] {
	if (!coords || coords.length === 0) return [0, 0];
	const first = coords[0];
	if (typeof first === 'number') return [coords[0] as number, coords[1] as number];
	return [(first as number[])[0], (first as number[])[1]];
}

function mapLeadToApproval(lead: ApiLead): Approval {
	const fd  = lead.farmer_data;
	const [lat, lng] = extractLatLng(fd.land_coordinates as any);

	const rawImages = lead.land_media?.images ?? fd.land_images ?? [];
	const images: [string, string, string] = [
		rawImages[0] || LAND_IMG_PLACEHOLDER,
		rawImages[1] || LAND_IMG_PLACEHOLDER,
		rawImages[2] || LAND_IMG_PLACEHOLDER,
	];
	const videoUrl = lead.land_media?.video ?? fd.land_video ?? '';

	const kycArr  = Array.isArray(lead.kyc_data) ? lead.kyc_data : (lead.kyc_data && Object.keys(lead.kyc_data).length ? [lead.kyc_data] : []);
	const kyc     = kycArr[0] ?? {};
	const address = kyc.permanent_address ?? [fd.village, fd.district, fd.state].filter(Boolean).join(', ');

	const area: number     = fd.estimated_land_area;
	const priority: 'high' | 'medium' | 'low' = area >= 100 ? 'high' : area >= 30 ? 'medium' : 'low';

	const agArr    = Array.isArray(lead.agreement_data) ? lead.agreement_data : (lead.agreement_data && Object.keys(lead.agreement_data).length ? [lead.agreement_data] : []);
	const ag       = agArr[0] ?? {};
	const amount: number | null = ag.lease_rent ?? null;

	const location = [fd.village ?? fd.taluka ?? fd.tehsil, fd.district].filter(Boolean).join(', ');

	return {
		id:          lead.lead_id,
		category:    'lands',
		subType:     fd.farming_option,
		title:       `${fd.full_name} — ${area} Acres${location ? `, ${location}` : ''}`,
		description: `${fd.farming_option} · ${fd.lead_source ?? ''} · ${[fd.village, fd.district, fd.state].filter(Boolean).join(', ')}`,
		requester:   fd.full_name,
		department:  'Field Operations',
		amount,
		date:        lead.created_at.split('T')[0],
		status:      'pending',
		priority,
		landDetails: {
			images,
			videoUrl,
			mapping: {
				lat,
				lng,
				area:        `${area} Acres`,
				surveyNo:    `Lead #${lead.lead_id.slice(0, 8).toUpperCase()}`,
				village:     fd.village ?? fd.taluka ?? fd.tehsil ?? '',
				district:    [fd.district, fd.state].filter(Boolean).join(', '),
				coordinates: fd.land_coordinates as any,
			},
			owner: {
				name:    fd.full_name,
				phone:   fd.phone_number,
				address,
			},
		},
	};
}

// ─────────────────────────────────────────────────────────────
// Finance ops indent mapper
// ─────────────────────────────────────────────────────────────

function mapFinanceIndentToApproval(raw: any, viewerIsEA = false): Approval {
	const isSPR = (raw.pr_number ?? '').includes('/SPR/');
	const items: FinanceItem[] = (raw.indent_data?.item_row ?? []).map((r: any) =>
		isSPR
			? { srNo: r.sr_no ?? 0, name: r.service_description ?? '', qty: r.quantity ?? 0, uom: r.uom ?? '', value: r.approx_value_of_services ?? 0, gstAmt: r.gst_amount }
			: { srNo: r.sr_no ?? 0, name: r.part_name ?? '', qty: r.net_pr_qty ?? 0, uom: r.uom ?? '', rate: r.rate_per_item, value: r.approx_value ?? 0 },
	);
	const total      = items.reduce((s, it) => s + it.value, 0);
	const indentType = isSPR ? 'Service Purchase Requisition' as const : 'Purchase Requisition' as const;
	return {
		id:          raw.pr_number,
		category:    'purchase',
		subType:     indentType,
		title:       raw.indent_data?.project ?? raw.indent_data?.name_of_service ?? raw.pr_number,
		description: raw.notes ?? '',
		requester:   raw.indented_by?.name_id  ?? '',
		department:  raw.department            ?? '',
		amount:      total,
		date:        (raw.created_at ?? '').split('T')[0],
		status:      viewerIsEA
			? (raw.forwarded_by?.signature ? 'approved' : 'pending')
			: (raw.approved_by?.signature  ? 'approved' : 'pending'),
		priority:    'low',
		financeIndent: {
			indentType,
			prNumber:    raw.pr_number,
			indentedBy:  raw.indented_by?.name_id  ?? '',
			forwardedBy: raw.forwarded_by?.name_id ?? '',
			items,
			total,
			notes:      raw.notes      || undefined,
			department: raw.department || undefined,
			createdAt:  raw.created_at,
		},
	};
}

// ─────────────────────────────────────────────────────────────
// Dummy data
// ─────────────────────────────────────────────────────────────

export const DUMMY_APPROVALS: Approval[] = [
	// ── LANDS ──
	{
		id: 'LND-2026-011', category: 'lands', subType: 'Farm Registration',
		title: 'New Farm Registration — Sehore Block C',
		description: '12.5 acres agricultural land registered under Contract Farming in Sehore, Madhya Pradesh.',
		requester: 'Rajesh Kumar', department: 'Field Operations',
		amount: null, date: '2026-06-09', status: 'pending', priority: 'high',
		landDetails: {
			images: [
				'https://picsum.photos/seed/lnd011-a/400/250',
				'https://picsum.photos/seed/lnd011-b/400/250',
				'https://picsum.photos/seed/lnd011-c/400/250',
			],
			videoUrl: '#',
			mapping: { lat: 22.7389, lng: 77.0965, area: '12.5 Acres', surveyNo: 'Survey No. 142/B', village: 'Village Amkheda', district: 'Sehore District' },
			owner: { name: 'Ramesh Patidar', phone: '+91 94251 67890', address: 'Village Amkheda, Tehsil Sehore, Sehore, MP – 466001' },
		},
	},
	{
		id: 'LND-2026-012', category: 'lands', subType: 'Land Acquisition',
		title: 'Land Acquisition — 30 Acres, Raisen',
		description: '30-acre parcel acquisition near Bareli tehsil for Napier cultivation expansion.',
		requester: 'Amit Patel', department: 'Operations',
		amount: 4500000, date: '2026-06-08', status: 'pending', priority: 'high',
		landDetails: {
			images: [
				'https://picsum.photos/seed/lnd012-a/400/250',
				'https://picsum.photos/seed/lnd012-b/400/250',
				'https://picsum.photos/seed/lnd012-c/400/250',
			],
			videoUrl: '#',
			mapping: { lat: 23.2541, lng: 77.8301, area: '30 Acres', surveyNo: 'Survey No. 78/A', village: 'Village Bareli', district: 'Raisen District' },
			owner: { name: 'Ishwar Das Vishwakarma', phone: '+91 98930 44521', address: 'Near Tehsil Office, Bareli, Raisen, MP – 464551' },
		},
	},
	{
		id: 'LND-2026-013', category: 'lands', subType: 'Lease Agreement',
		title: 'Lease Renewal — Farm LND-045 (5 Years)',
		description: 'Renewal of 5-year lease for 8.75 acres currently under Paddy cultivation in Vidisha.',
		requester: 'Priya Singh', department: 'Administration',
		amount: 175000, date: '2026-06-07', status: 'pending', priority: 'medium',
		landDetails: {
			images: [
				'https://picsum.photos/seed/lnd013-a/400/250',
				'https://picsum.photos/seed/lnd013-b/400/250',
				'https://picsum.photos/seed/lnd013-c/400/250',
			],
			videoUrl: '#',
			mapping: { lat: 23.5253, lng: 77.8147, area: '8.75 Acres', surveyNo: 'Survey No. 215/C', village: 'Village Khamkheda', district: 'Vidisha District' },
			owner: { name: 'Sukhdev Yadav', phone: '+91 70490 12345', address: 'Village Khamkheda, Tehsil Vidisha, Vidisha, MP – 464001' },
		},
	},
	{
		id: 'LND-2026-009', category: 'lands', subType: 'Plot Approval',
		title: 'Plot Demarcation — Block B Farms',
		description: 'Approval for GPS-based boundary marking of 6 plots across 3 farms in Block B.',
		requester: 'Suresh Verma', department: 'Field Operations',
		amount: null, date: '2026-06-05', status: 'approved', priority: 'medium',
		landDetails: {
			images: [
				'https://picsum.photos/seed/lnd009-a/400/250',
				'https://picsum.photos/seed/lnd009-b/400/250',
				'https://picsum.photos/seed/lnd009-c/400/250',
			],
			videoUrl: '#',
			mapping: { lat: 22.9102, lng: 77.0854, area: '6 Plots', surveyNo: 'Survey No. 56/D', village: 'Village Bilkhiria', district: 'Sehore District' },
			owner: { name: 'Ganesh Prasad Tiwari', phone: '+91 88279 33210', address: 'Block B Farm Complex, Sehore, MP – 466001' },
		},
	},
	{
		id: 'LND-2026-008', category: 'lands', subType: 'Farm Registration',
		title: 'Farm Registration — Hoshangabad (Lease)',
		description: '18 acres for Ragi cultivation. All documents verified. Awaiting director sign-off.',
		requester: 'Neha Gupta', department: 'Finance',
		amount: null, date: '2026-06-03', status: 'rejected', priority: 'low',
		landDetails: {
			images: [
				'https://picsum.photos/seed/lnd008-a/400/250',
				'https://picsum.photos/seed/lnd008-b/400/250',
				'https://picsum.photos/seed/lnd008-c/400/250',
			],
			videoUrl: '#',
			mapping: { lat: 22.7534, lng: 77.7275, area: '18 Acres', surveyNo: 'Survey No. 301/A', village: 'Village Semri', district: 'Hoshangabad District' },
			owner: { name: 'Bharat Lal Kurmi', phone: '+91 76545 89012', address: 'Village Semri, Tehsil Hoshangabad, MP – 461001' },
		},
	},

	// ── PURCHASE ──
	{
		id: 'PUR-2026-041', category: 'purchase', subType: 'Purchase Indent',
		title: 'Drip Irrigation System — Block D',
		description: 'Complete drip irrigation setup for 15-acre Napier plot in Block D. Includes pipes, emitters, and pump.',
		requester: 'Rajesh Kumar', department: 'Field Operations',
		amount: 240000, date: '2026-06-09', status: 'pending', priority: 'high',
		indentDetails: {
			project: 'Block D — Napier Cultivation',
			indentedBy: 'Rajesh Kumar',
			forwardedBy: 'Suresh Verma',
			directorsApproval: 'RAJENDRA SHRINGARPUTALE',
			remarksNotes: 'Required before Kharif season onset',
			budgetHead: 'Machinery - Irrigation',
			items: [
				{
					id: 'pur041-1', srNo: 1, itemCode: 'DRP-001',
					partName: 'Drip Irrigation System',
					specification: 'Complete setup with pipes, emitters, filter & pump for 15 acres',
					uom: 'Set', totalQtyRequired: 1, lessQtyAvailableInStock: 0,
					procurementLeadTimeWeeks: 3, materialRequiredByDate: '2026-06-25',
					indigenousOrImported: 'Indigenous', ratePerItem: 240000,
					preferredVendorName: 'AgroIrri Pvt Ltd',
					validityOfWarrantyAndGuarantee: '1 Year', fullLifeHr: 'NA', actualLifeHr: 'NA',
					reasonForReplacement: 'New Installation', repairingPossibility: 'NA',
				},
			],
		},
	},
	{
		id: 'PUR-2026-042', category: 'purchase', subType: 'NFA',
		title: 'Vendor Empanelment — BioGrow Agri',
		description: 'Non-financial approval for onboarding BioGrow Agri as authorized pesticide supplier.',
		requester: 'Amit Patel', department: 'Operations',
		amount: null, date: '2026-06-08', status: 'pending', priority: 'medium',
	},
	{
		id: 'PUR-2026-039', category: 'purchase', subType: 'Purchase Order',
		title: 'Bulk Fertilizer Order — Kharif Pre-Season',
		description: '20 MT Urea + 10 MT DAP for all blocks. Price locked with AgriChem for 30 days.',
		requester: 'Suresh Verma', department: 'Field Operations',
		amount: 95000, date: '2026-06-07', status: 'pending', priority: 'high',
		indentDetails: {
			project: 'Kharif Pre-Season 2026 — All Blocks',
			indentedBy: 'Suresh Verma',
			forwardedBy: 'Amit Patel',
			directorsApproval: 'RAJENDRA SHRINGARPUTALE',
			remarksNotes: 'Price locked with AgriChem for 30 days. Order before 2026-07-07.',
			budgetHead: 'Cultivation - Fertilizers',
			items: [
				{
					id: 'pur039-1', srNo: 1, itemCode: 'FRT-UREA',
					partName: 'Urea',
					specification: '46% Nitrogen, 50 kg bags',
					uom: 'MT', totalQtyRequired: 20, lessQtyAvailableInStock: 2,
					procurementLeadTimeWeeks: 1, materialRequiredByDate: '2026-06-20',
					indigenousOrImported: 'Indigenous', ratePerItem: 3800,
					preferredVendorName: 'AgriChem Solutions',
					validityOfWarrantyAndGuarantee: 'NA', fullLifeHr: 'NA', actualLifeHr: 'NA',
					reasonForReplacement: 'Seasonal Procurement', repairingPossibility: 'NA',
				},
				{
					id: 'pur039-2', srNo: 2, itemCode: 'FRT-DAP',
					partName: 'DAP',
					specification: '18-46-0, 50 kg bags',
					uom: 'MT', totalQtyRequired: 10, lessQtyAvailableInStock: 1,
					procurementLeadTimeWeeks: 1, materialRequiredByDate: '2026-06-20',
					indigenousOrImported: 'Indigenous', ratePerItem: 5600,
					preferredVendorName: 'AgriChem Solutions',
					validityOfWarrantyAndGuarantee: 'NA', fullLifeHr: 'NA', actualLifeHr: 'NA',
					reasonForReplacement: 'Seasonal Procurement', repairingPossibility: 'NA',
				},
			],
		},
	},
	{
		id: 'PUR-2026-036', category: 'purchase', subType: 'Vendor Empanelment',
		title: 'AgriChem Solutions — Approved Vendor',
		description: 'Empanelment of AgriChem Solutions for fertilizer and crop protection products.',
		requester: 'Priya Singh', department: 'Administration',
		amount: null, date: '2026-06-04', status: 'approved', priority: 'low',
	},
	{
		id: 'PUR-2026-033', category: 'purchase', subType: 'Purchase Indent',
		title: 'Tractor Repair — TR-003 Engine Overhaul',
		description: 'Engine overhaul and clutch replacement for Tractor TR-003 (Mahindra 575).',
		requester: 'Suresh Verma', department: 'Field Operations',
		amount: 35000, date: '2026-06-03', status: 'rejected', priority: 'medium',
		indentDetails: {
			project: 'Equipment Maintenance — TR-003',
			indentedBy: 'Suresh Verma',
			forwardedBy: 'Rajesh Kumar',
			directorsApproval: 'RAJENDRA SHRINGARPUTALE',
			remarksNotes: 'Tractor TR-003 currently grounded. Urgent repair needed.',
			budgetHead: 'Maintenance - Vehicles',
			items: [
				{
					id: 'pur033-1', srNo: 1, itemCode: 'MAINT-TR003',
					partName: 'Engine Overhaul & Clutch Replacement',
					specification: 'Mahindra 575 — Engine Overhaul + Clutch Kit',
					uom: 'Job', totalQtyRequired: 1, lessQtyAvailableInStock: 0,
					procurementLeadTimeWeeks: 2, materialRequiredByDate: '2026-06-15',
					indigenousOrImported: 'Indigenous', ratePerItem: 35000,
					preferredVendorName: 'Local Workshop',
					validityOfWarrantyAndGuarantee: '6 Months', fullLifeHr: '5000', actualLifeHr: '4800',
					reasonForReplacement: 'Engine failure — worn clutch plates', repairingPossibility: 'Yes',
				},
			],
		},
	},

	// ── HR ──
	{
		id: 'HR-2026-019', category: 'hr', subType: 'Manpower Requisition',
		title: 'MRF — Senior Agronomist (1 Post)',
		description: 'Requirement for a senior agronomist with 5+ years experience in drip irrigation and precision farming.',
		requester: 'Neha Gupta', department: 'Human Resources',
		amount: null, date: '2026-06-09', status: 'pending', priority: 'high',
	},
	{
		id: 'HR-2026-020', category: 'hr', subType: 'Manpower Requisition',
		title: 'MRF — Field Officers x4 (Block C)',
		description: 'Urgent hiring of 4 field officers to manage Kharif operations in the newly added Block C farms.',
		requester: 'Neha Gupta', department: 'Human Resources',
		amount: null, date: '2026-06-08', status: 'pending', priority: 'high',
	},
	{
		id: 'HR-2026-018', category: 'hr', subType: 'Contract Renewal',
		title: 'Seasonal Worker Contracts — Kharif 2026',
		description: 'Renewal of contracts for 12 seasonal farm workers for the upcoming Kharif harvest.',
		requester: 'Priya Singh', department: 'Administration',
		amount: null, date: '2026-06-07', status: 'pending', priority: 'medium',
	},
	{
		id: 'HR-2026-015', category: 'hr', subType: 'Salary Revision',
		title: 'Field Staff Salary Increment — 8%',
		description: 'Annual performance-based salary revision of 8% for all field operations staff (17 employees).',
		requester: 'Neha Gupta', department: 'Human Resources',
		amount: null, date: '2026-06-04', status: 'approved', priority: 'medium',
	},
	{
		id: 'HR-2026-012', category: 'hr', subType: 'Staff Onboarding',
		title: 'Onboarding — 2 Agronomists (Fresher)',
		description: 'Campus recruitment approvals for 2 B.Sc. Agriculture graduates joining next quarter.',
		requester: 'Priya Singh', department: 'Administration',
		amount: null, date: '2026-06-02', status: 'rejected', priority: 'low',
	},

	// ── ACCOUNTS ──
	{
		id: 'ACC-2026-087', category: 'accounts', subType: 'Fuel Request',
		title: 'Tractor Diesel — Block A + B Operations',
		description: '400 litres diesel for 4 tractors across Block A and B. Covers next 2-week operational cycle.',
		requester: 'Suresh Verma', department: 'Field Operations',
		amount: 37200, date: '2026-06-09', status: 'pending', priority: 'high',
	},
	{
		id: 'ACC-2026-088', category: 'accounts', subType: 'Payment Release',
		title: 'Vendor Invoice — AgriChem Solutions',
		description: 'Release of outstanding payment for April–May fertilizer supply. Invoice #AGC-2026-0189.',
		requester: 'Neha Gupta', department: 'Finance',
		amount: 75000, date: '2026-06-08', status: 'pending', priority: 'high',
	},
	{
		id: 'ACC-2026-085', category: 'accounts', subType: 'Expense Claim',
		title: 'Director Field Visit Expenses — May 2026',
		description: 'Reimbursement for travel, accommodation, and local conveyance during 4 field visits in May 2026.',
		requester: 'Rajesh Kumar', department: 'Field Operations',
		amount: 12500, date: '2026-06-07', status: 'pending', priority: 'low',
	},
	{
		id: 'ACC-2026-079', category: 'accounts', subType: 'Budget Approval',
		title: 'Kharif 2026 Season Operating Budget',
		description: 'Annual operating expenditure budget for Kharif 2026 season across all blocks.',
		requester: 'Neha Gupta', department: 'Finance',
		amount: 550000, date: '2026-06-03', status: 'approved', priority: 'high',
	},
	{
		id: 'ACC-2026-071', category: 'accounts', subType: 'Payment Release',
		title: 'Advance Payment — Equipment Supplier',
		description: '30% advance for combine harvester order. Supplier requested before production confirmation.',
		requester: 'Amit Patel', department: 'Operations',
		amount: 100000, date: '2026-06-01', status: 'rejected', priority: 'high',
	},
];

// ─────────────────────────────────────────────────────────────
// Bottom navigation
// ─────────────────────────────────────────────────────────────

const BASE = '/approval/webapp';

const BottomNav = ({ approvals }: { approvals: Approval[] }) => {
	const pendingOf = (cat: ApprovalCategory) =>
		approvals.filter(a => a.category === cat && a.status === 'pending').length;

	const pendingFuel = approvals.filter(
		a => a.category === 'accounts' && a.subType === 'Fuel Request' && a.status === 'pending',
	).length;

	// Order: Lands | HOME(center circle) | Fuel
	const items = [
		{ to: `${BASE}/lands`, label: 'Lands', Icon: MapPin,          end: false, badge: pendingOf('lands'), isHome: false },
		{ to: `${BASE}/`,      label: 'Home',  Icon: LayoutDashboard, end: true,  badge: 0,                  isHome: true  },
		{ to: `${BASE}/fuel`,  label: 'Fuel',  Icon: Fuel,            end: false, badge: pendingFuel,        isHome: false },
	];

	return (
		<nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 flex items-end h-16 max-w-md mx-auto overflow-visible">
			{items.map(({ to, label, Icon, end, badge, isHome }) => (
				<NavLink
					key={to}
					to={to}
					end={end}
					className="flex-1 flex flex-col items-center justify-end pb-2 gap-0.5 relative"
				>
					{({ isActive }) => (
						<>
							{/* Active indicator line — only for non-home items */}
							{!isHome && isActive && (
								<span className="absolute top-0 inset-x-0 mx-auto w-8 h-0.5 bg-emerald-500 rounded-full" />
							)}

							{isHome ? (
								/* Raised circular FAB in the center */
								<div className="flex flex-col items-center -translate-y-4">
									<div className={`w-14 h-14 rounded-full flex items-center justify-center shadow-xl border-4 border-white transition-all ${isActive ? 'bg-emerald-700 scale-105' : 'bg-emerald-500'}`}>
										<Icon className="w-6 h-6 text-white" />
									</div>
									<span className={`text-[10px] font-semibold mt-1 ${isActive ? 'text-emerald-700' : 'text-emerald-500'}`}>
										{label}
									</span>
								</div>
							) : (
								<>
									<div className="relative">
										<Icon className={`w-5 h-5 transition-colors ${isActive ? 'text-emerald-600' : 'text-gray-400'}`} />
										{badge > 0 && (
											<span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-0.5 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
												{badge > 9 ? '9+' : badge}
											</span>
										)}
									</div>
									<span className={`text-[10px] font-medium ${isActive ? 'text-emerald-600' : 'text-gray-400'}`}>
										{label}
									</span>
								</>
							)}
						</>
					)}
				</NavLink>
			))}
		</nav>
	);
};

// ─────────────────────────────────────────────────────────────
// Root
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// Notification prompt banner
// ─────────────────────────────────────────────────────────────

const NotificationPrompt = () => {
	const { state, subscribe } = usePushNotification();
	const [dismissed, setDismissed] = useState(false);

	if (dismissed || state === 'subscribed' || state === 'denied' || state === 'unsupported') return null;

	return (
		<div className="mx-4 mt-3 flex items-start gap-3 rounded-xl bg-emerald-50 border border-emerald-200 px-3.5 py-3">
			<div className="mt-0.5 w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
				<Bell className="w-3.5 h-3.5 text-emerald-600" />
			</div>
			<div className="flex-1 min-w-0">
				<p className="text-xs font-semibold text-emerald-900">Enable notifications</p>
				<p className="text-[11px] text-emerald-700 mt-0.5 leading-snug">
					Get instant alerts when approvals need your attention.
				</p>
				<button
					onClick={subscribe}
					disabled={state === 'loading'}
					className="mt-2 text-[11px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 px-3 py-1.5 rounded-lg transition-colors"
				>
					{state === 'loading' ? 'Enabling…' : 'Enable now'}
				</button>
			</div>
			<button
				onClick={() => setDismissed(true)}
				className="shrink-0 p-0.5 text-emerald-400 hover:text-emerald-600 transition-colors"
				aria-label="Dismiss"
			>
				<X className="w-3.5 h-3.5" />
			</button>
		</div>
	);
};

// ─────────────────────────────────────────────────────────────
// Unauthorized screen
// ─────────────────────────────────────────────────────────────
const UnauthorizedScreen = ({ designation, onLogout }: { designation?: string; onLogout: () => void }) => (
	<div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-6 text-center">
		<div className="w-20 h-20 rounded-3xl bg-red-100 flex items-center justify-center mb-5 shadow-sm">
			<ShieldOff className="w-10 h-10 text-red-500" />
		</div>
		<h2 className="text-xl font-bold text-gray-900">Access Denied</h2>
		<p className="text-sm text-gray-500 mt-2 leading-relaxed max-w-[280px]">
			This portal is restricted to <span className="font-semibold text-gray-700">EA To Director</span> and{' '}
			<span className="font-semibold text-gray-700">Director</span> roles only.
		</p>
		{designation && (
			<div className="mt-4 inline-flex items-center gap-2 rounded-full bg-red-50 border border-red-200 px-4 py-2">
				<span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
				<span className="text-xs font-semibold text-red-700">{designation}</span>
			</div>
		)}
		<p className="text-xs text-gray-400 mt-6 max-w-[240px] leading-relaxed">
			Your account does not have the required permissions. Please contact your administrator.
		</p>
		<button
			onClick={onLogout}
			className="mt-6 flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-semibold active:bg-gray-700 transition-colors"
		>
			<LogOut className="w-4 h-4" />
			Sign out
		</button>
	</div>
);

const WebApp = () => {
	const { token, user, loading, logout } = useAuth();

	// Lands + purchase come from real APIs; HR and Accounts keep dummy data for now
	const [approvals, setApprovals] = useState<Approval[]>(
		DUMMY_APPROVALS.filter(a => a.category !== 'lands' && a.category !== 'purchase'),
	);

	useEffect(() => {
		if (!token || !user?.designation) return;

		const isEA       = user.designation === 'EA To Director';
		const staffId    = user.id ?? '';

		const base = getBaseUrl().replace(/\/$/, '');
		fetch(`${base}/farmer_managment/get_leads`, {
			headers: { Authorization: `Bearer ${token}` },
		})
			.then(r => r.json())
			.then((data: { leads: ApiLead[] }) => {
				const all = data?.leads ?? [];

				let landApprovals: Approval[];
				if (isEA) {
					// EA To Director sees only 'contacted' leads (waiting to be forwarded)
					landApprovals = all
						.filter(l => l.status === 'contacted')
						.map(mapLeadToApproval);
				} else {
					// Directors see leads that have been forwarded specifically to them
					landApprovals = all
						.filter(
							l =>
								l.status === 'forwarded_to_director' &&
								(l.forwarded_directors ?? []).some(d => d.staff_id === staffId),
						)
						.map(mapLeadToApproval);
				}

				setApprovals(prev => [
					...prev.filter(a => a.category !== 'lands'),
					...landApprovals,
				]);
			})
			.catch(err => console.error('[WebApp] leads fetch error:', err));
	}, [token, user?.designation, user?.id]);

	useEffect(() => {
		if (!token || !user?.designation) return;
		const isEA   = user.designation === 'EA To Director';
		const endpoint = isEA ? 'get_admin_ops_indents' : 'get_finance_ops_indents';
		const dataKey  = isEA ? 'admin_ops_indents'     : 'finance_ops_indents';
		const base = getBaseUrl().replace(/\/$/, '');
		fetch(`${base}/purchase_flow/${endpoint}`, {
			headers: { Authorization: `Bearer ${token}` },
		})
			.then(r => r.json())
			.then((data: Record<string, any[]>) => {
				const raw      = data?.[dataKey] ?? [];
				const filtered = isEA
					? raw.filter((r: any) => r.indented_by?.signature)   // requestor must have signed
					: raw.filter((r: any) => r.forwarded_by?.signature); // EA must have forwarded
				const mapped = filtered.map((r: any) => mapFinanceIndentToApproval(r, isEA));
				setApprovals(prev => [...prev.filter(a => a.category !== 'purchase'), ...mapped]);
			})
			.catch(err => console.error('[WebApp] purchase indents fetch error:', err));
	}, [token, user?.designation]);

	if (loading) {
		return (
			<div className="min-h-screen bg-gray-50 flex items-center justify-center">
				<div className="w-8 h-8 rounded-full border-2 border-emerald-600 border-t-transparent animate-spin" />
			</div>
		);
	}

	if (!token) return <WebAppLogin />;

	const ALLOWED = ['EA To Director', 'Director'];
	if (!ALLOWED.includes(user?.designation ?? '')) {
		return <UnauthorizedScreen designation={user?.designation} onLogout={logout} />;
	}

	const handleApprove = (id: string) => {
		setApprovals(prev => prev.map(a => a.id === id ? { ...a, status: 'approved' } : a));
		toast.success('Approved successfully');
	};

	const handleReject = (id: string) => {
		setApprovals(prev => prev.map(a => a.id === id ? { ...a, status: 'rejected' } : a));
		toast.error('Request rejected');
	};

	const totalPending = approvals.filter(a => a.status === 'pending').length;
	const props = { approvals, onApprove: handleApprove, onReject: handleReject };

	return (
		<div className="min-h-screen bg-gray-50">
			<div className="flex flex-col max-w-md mx-auto w-full min-h-screen relative">

				{/* Sticky top bar */}
				<header className="sticky top-0 z-40 bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between">
					<div className="flex items-center gap-2">
						<div className="w-7 h-7 rounded-lg bg-emerald-600 flex items-center justify-center">
							<Sprout className="w-4 h-4 text-white" />
						</div>
						<div>
							<div className="text-sm font-bold text-gray-900 leading-none">
								{user?.name || 'SaiConnect'}
							</div>
							<div className="text-[10px] text-gray-400 leading-none mt-0.5">
								{user?.designation || 'Director Portal'}
							</div>
						</div>
					</div>
					<div className="flex items-center gap-2">
						{totalPending > 0 && (
							<span className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full ring-1 ring-amber-200">
								<span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
								{totalPending} pending
							</span>
						)}
						<button
							onClick={logout}
							title="Sign out"
							className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
						>
							<LogOut className="w-4 h-4" />
						</button>
					</div>
				</header>

				{/* Notification prompt — shown only when backend says permissions not yet granted */}
				{user?.notification_permissions === false && <NotificationPrompt />}

				{/* Page content */}
				<main className="flex-1 overflow-auto pb-20">
					<Routes>
						<Route index          element={<HomePage />} />
						<Route path="lands"    element={<LandsPage />} />
						<Route path="fuel"     element={<FuelPage     {...props} />} />
						<Route path="purchase" element={<PurchasePage {...props} />} />
						<Route path="hr"       element={<HRPage       {...props} />} />
						<Route path="accounts" element={<AccountsPage {...props} />} />
						<Route path="*"        element={<Navigate to={`${BASE}/`} replace />} />
					</Routes>
				</main>

				<BottomNav approvals={approvals} />
			</div>
		</div>
	);
};

export default WebApp;
