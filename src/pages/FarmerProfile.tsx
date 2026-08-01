import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, BadgeCheck, ShieldCheck, Phone, Mail,
  FileText, Printer, Bell, ChevronDown,
  CheckCircle2, Leaf, User, Landmark,
  Search, Calendar, Map, Users,
} from "lucide-react";
import getBaseUrl from "@/lib/config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { MapContainer, TileLayer, Polygon } from "react-leaflet";
import "leaflet/dist/leaflet.css";

type FarmerDoc = { s3_key?: string; uploaded_at?: string; url?: string };
type FarmerKyc = { adhar_number?: string; pan_numnber?: string; permanent_address?: string; updated_at?: string };
type FarmerAgreement = { lease_rent?: number; agreement_start_date?: string; agreement_end_date?: string };
type FarmerBank = { bank_name?: string; account_number?: string; ifsc_code?: string; IFSC_code?: string };
type FarmerCore = {
  farmer_id: string;
  farmer_name?: string;
  farmer_contact?: string;
  farmer_alternate_contact?: string;
  farming_option?: string;
  farmer_address?: string;
  kyc_data?: FarmerKyc[];
  agreement_data?: FarmerAgreement[];
  bank_details?: FarmerBank[];
  documents?: Record<string, FarmerDoc>;
};
type FarmItem = {
  land_coordinates?: number[][];
  total_area?: number;
  land_media?: Record<string, any>;
  state?: string;
  district?: string;
  village?: string;
  cluster?: string;
  zone?: string;
  block?: string;
  crop_type?: string;
};
type FarmerDetailsResponse = { farmer?: FarmerCore; farm?: FarmItem[] };

const toDisplayDate = (d?: string) => {
  if (!d) return "N/A";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

const toRelativeTime = (d?: string) => {
  if (!d) return "Recently";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return d;
  const diffMs = Date.now() - dt.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) {
    const h = dt.getHours() % 12 || 12;
    const mins = String(dt.getMinutes()).padStart(2, "0");
    const ampm = dt.getHours() >= 12 ? "PM" : "AM";
    return `Today, ${h}:${mins} ${ampm}`;
  }
  if (diffDays === 1) return "Yesterday";
  return toDisplayDate(d);
};

const isImageUrl = (url?: string) => /\.(png|jpg|jpeg|webp|gif)(\?|$)/i.test(url || "");
const isPdfUrl = (url?: string) => /\.pdf(\?|$)/i.test(url || "");

const DocCard = ({ title, doc }: { title: string; doc?: FarmerDoc }) => {
  const url = doc?.url;
  const isImg = isImageUrl(url);
  const isPdf = isPdfUrl(url);

  return (
    <div className="flex flex-col items-center gap-1.5 min-w-[110px]">
      <div className="relative w-[100px] h-[76px] rounded-lg border overflow-hidden bg-white shadow-sm">
        {isImg ? (
          <img src={url} alt={title} className="w-full h-full object-cover" />
        ) : isPdf ? (
          <div className="w-full h-full flex flex-col items-center justify-center gap-1 bg-red-50">
            <span className="bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">PDF</span>
            <FileText className="h-6 w-6 text-red-400" />
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gray-50">
            <FileText className="h-7 w-7 text-gray-400" />
          </div>
        )}
        {url && (
          <div className="absolute top-1 right-1 h-4 w-4 rounded-full bg-green-500 flex items-center justify-center">
            <CheckCircle2 className="h-3 w-3 text-white" />
          </div>
        )}
      </div>
      <div className="text-xs text-center font-medium">{title}</div>
      {url ? (
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" className="h-7 text-xs px-5">View</Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl">
            <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
            <div className="h-[70vh] rounded-md border overflow-hidden bg-black/5">
              {isImg ? (
                <img src={url} alt={title} className="h-full w-full object-contain bg-white" />
              ) : (
                <iframe src={url} title={title} className="h-full w-full" />
              )}
            </div>
          </DialogContent>
        </Dialog>
      ) : (
        <Button variant="outline" className="h-7 text-xs px-5" disabled>View</Button>
      )}
    </div>
  );
};

const FarmerProfile = () => {
  const { farmer_id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [details, setDetails] = useState<FarmerDetailsResponse | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const base = getBaseUrl().replace(/\/$/, "");
        const resp = await fetch(`${base}/farmer_managment/farmer_details/${farmer_id}`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        setDetails((await resp.json()) as FarmerDetailsResponse);
      } catch (e) {
        console.error(e);
        setDetails(null);
      } finally {
        setLoading(false);
      }
    };
    if (farmer_id) load();
  }, [farmer_id]);

  const farmer = details?.farmer;
  const farms = details?.farm || [];
  const docs = farmer?.documents || {};
  const kyc = farmer?.kyc_data?.[0] || {};
  const agreement = farmer?.agreement_data?.[0] || {};
  const bank = farmer?.bank_details?.[0];
  const farm = farms[0];

  const profilePhoto = docs?.profile_photo?.url || "/placeholder.svg";
  const totalAcres = farms.reduce((a, f) => a + Number(f.total_area || 0), 0);
  const docCount = Object.values(docs).filter(d => d?.url).length;

  const mapCoords = useMemo((): [number, number][] => {
    const coords = farm?.land_coordinates;
    if (!coords || coords.length === 0) return [];
    return coords.map(c => [c[0], c[1]] as [number, number]);
  }, [farm]);

  const mapCenter = useMemo((): [number, number] | null => {
    if (mapCoords.length === 0) return null;
    const lat = mapCoords.reduce((s, c) => s + c[0], 0) / mapCoords.length;
    const lng = mapCoords.reduce((s, c) => s + c[1], 0) / mapCoords.length;
    return [lat, lng];
  }, [mapCoords]);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!farmer) return <div className="p-6 text-muted-foreground">Farmer not found.</div>;

  const registeredDate = toDisplayDate(kyc.updated_at);

  const activityItems = [
    {
      iconEl: <ShieldCheck className="h-3.5 w-3.5 text-white" />,
      iconBg: "bg-green-500",
      title: "KYC Verified",
      desc: "KYC verification completed successfully",
      time: toRelativeTime(kyc.updated_at),
    },
    {
      iconEl: <FileText className="h-3.5 w-3.5 text-white" />,
      iconBg: "bg-blue-500",
      title: "Agreement Uploaded",
      desc: "Lease agreement uploaded",
      time: toRelativeTime(agreement.agreement_start_date),
    },
    {
      iconEl: <Leaf className="h-3.5 w-3.5 text-white" />,
      iconBg: "bg-green-500",
      title: "Land Added",
      desc: `${totalAcres} acres of land added`,
      time: "Recently",
    },
    {
      iconEl: <User className="h-3.5 w-3.5 text-white" />,
      iconBg: "bg-purple-500",
      title: "Farmer Registered",
      desc: "Farmer profile created",
      time: registeredDate,
    },
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* Top bar */}
      <div className="border-b px-6 py-3 flex items-center justify-between bg-white">
        <button
          onClick={() => navigate("/farmers")}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Farmers
        </button>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search farmers, phone, village..." className="pl-9 w-72 h-9 text-sm" />
          </div>
          <Button variant="ghost" size="icon" className="h-9 w-9 text-gray-600">
            <Printer className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-9 w-9 relative text-gray-600">
            <Bell className="h-4 w-4" />
            <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-red-500 text-white text-[9px] flex items-center justify-center font-bold">3</span>
          </Button>
          <Button className="bg-green-600 hover:bg-green-700 h-9 gap-1 px-4">
            Actions <ChevronDown className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Title section */}
      <div className="px-6 pt-4 pb-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold leading-tight">{farmer.farmer_name || "Unknown"}</h1>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 text-green-700 border border-green-200 px-3 py-1 text-xs font-medium">
            <BadgeCheck className="h-3.5 w-3.5" /> Verified Farmer
          </span>
        </div>
        <p className="text-sm text-muted-foreground mt-0.5">Farmer ID: {farmer.farmer_id}</p>
      </div>

      {/* Content */}
      <div className="px-6 pb-6 space-y-4">

        {/* Row 1: Profile card + Recent Activity */}
        <div className="grid grid-cols-12 gap-4">

          {/* Profile + KYC card */}
          <div className="col-span-8 rounded-xl border bg-white p-5">
            <div className="flex gap-5 h-full">

              {/* Left: Photo + contact info + pills */}
              <div className="flex gap-4 flex-1 min-w-0">
                <div className="relative shrink-0">
                  <img
                    src={profilePhoto}
                    alt="profile"
                    className="h-[88px] w-[88px] rounded-full object-cover border-2 border-white shadow"
                  />
                  <div className="absolute bottom-0.5 right-0.5 h-6 w-6 rounded-full bg-green-500 border-2 border-white flex items-center justify-center">
                    <CheckCircle2 className="h-3.5 w-3.5 text-white" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-lg leading-tight">{farmer.farmer_name || "Unknown"}</div>
                  <div className="mt-2 flex items-center gap-2 text-sm text-gray-700">
                    <Phone className="h-4 w-4 shrink-0 text-gray-500" />
                    {farmer.farmer_contact || "N/A"}
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-sm text-gray-700">
                    <Phone className="h-4 w-4 shrink-0 text-gray-500" />
                    {farmer.farmer_alternate_contact || farmer.farmer_contact || "N/A"} (Alternate)
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-sm text-gray-500">
                    <Mail className="h-4 w-4 shrink-0" />
                    —
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-xs">
                      <Leaf className="h-3.5 w-3.5 text-green-600" />
                      <span className="text-gray-500">Farming Option</span>
                      <span className="font-medium text-gray-800">{farmer.farming_option || "Lease Farming"}</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-xs">
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                      <span className="text-gray-500">Status</span>
                      <span className="font-medium text-gray-800">Active</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-xs">
                      <Calendar className="h-3.5 w-3.5 text-green-600" />
                      <span className="text-gray-500">Registered On</span>
                      <span className="font-medium text-gray-800">{registeredDate}</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Right: KYC Information */}
              <div className="w-52 shrink-0 border-l pl-5">
                <div className="font-semibold text-sm mb-3">KYC Information</div>
                <div className="space-y-2.5">
                  <div>
                    <div className="text-xs text-muted-foreground">Aadhar Number</div>
                    <div className="text-sm font-medium mt-0.5">{kyc.adhar_number || "N/A"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">PAN Number</div>
                    <div className="text-sm font-medium mt-0.5">{kyc.pan_numnber || "N/A"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Permanent Address</div>
                    <div className="text-sm font-medium mt-0.5">{kyc.permanent_address || farmer.farmer_address || "N/A"}</div>
                  </div>
                  <div className="pt-1">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 text-green-700 border border-green-200 px-3 py-1 text-xs font-medium">
                      <ShieldCheck className="h-3.5 w-3.5" /> KYC Verified
                    </span>
                  </div>
                </div>
              </div>

            </div>
          </div>

          {/* Recent Activity */}
          <div className="col-span-4 rounded-xl border bg-white p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="font-semibold text-sm">Recent Activity</div>
              <button className="text-xs text-green-600 hover:underline">View all</button>
            </div>
            <div className="space-y-4">
              {activityItems.map((item, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className={`h-7 w-7 rounded-full ${item.iconBg} flex items-center justify-center shrink-0 mt-0.5`}>
                    {item.iconEl}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium leading-tight">{item.title}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{item.desc}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{item.time}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Row 2: Stats */}
        <div className="grid grid-cols-5 gap-3">
          <div className="rounded-xl border bg-white p-4">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
              <Map className="h-3.5 w-3.5" /> Total Land
            </div>
            <div className="text-2xl font-bold">{totalAcres}</div>
            <div className="text-xs text-muted-foreground">acres</div>
          </div>
          <div className="rounded-xl border bg-white p-4">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
              <Calendar className="h-3.5 w-3.5" /> Agreement Period
            </div>
            <div className="text-sm font-bold">{toDisplayDate(agreement.agreement_start_date)}</div>
            <div className="text-xs text-muted-foreground">to {toDisplayDate(agreement.agreement_end_date)}</div>
          </div>
          <div className="rounded-xl border bg-white p-4">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
              <Users className="h-3.5 w-3.5" /> Lease Rent
            </div>
            <div className="text-xl font-bold">₹{Number(agreement.lease_rent || 0).toLocaleString("en-IN")}</div>
            <div className="text-xs text-muted-foreground">per year</div>
          </div>
          <div className="rounded-xl border bg-white p-4">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
              <FileText className="h-3.5 w-3.5" /> Total Documents
            </div>
            <div className="text-2xl font-bold">{docCount}</div>
            <div className="text-xs text-muted-foreground">uploaded</div>
          </div>
          <div className="rounded-xl border bg-white p-4">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
              <Landmark className="h-3.5 w-3.5" /> Bank Details
            </div>
            {bank ? (
              <div className="text-sm font-bold text-green-600">Added</div>
            ) : (
              <div className="text-sm font-bold text-orange-500">Not Added</div>
            )}
          </div>
        </div>

        {/* Row 3: Documents */}
        <div className="rounded-xl border bg-white p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="font-semibold">Documents ({docCount})</div>
            <button className="text-xs text-green-600 hover:underline">View all documents</button>
          </div>
          <div className="flex gap-5 overflow-x-auto pb-1">
            <DocCard title="Aadhar Card" doc={docs.adhar_card} />
            <DocCard title="PAN Card" doc={docs.pand_card} />
            <DocCard title="Profile Photo" doc={docs.profile_photo} />
            <DocCard title="Agreement" doc={docs.agreement} />
            <DocCard title="Kisan Book" doc={docs.kisan_book} />
            <DocCard title="B1 Record" doc={docs.B1_record} />
            <DocCard title="Bank Passbook" doc={docs.bank_passbook} />
            <DocCard title="Bank Statement" doc={docs.bank_statement} />
          </div>
        </div>

        {/* Row 4: Land Details + Map + Agreement Summary */}
        <div className="grid grid-cols-12 gap-4">

          {/* Land Details */}
          <div className="col-span-3 rounded-xl border bg-white p-4">
            <div className="font-semibold mb-4">Farm / Land Details</div>
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Total Land Area</span>
                <span className="font-medium">{totalAcres} acres</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">State</span>
                <span className="font-medium">{farm?.state || "N/A"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">District</span>
                <span className="font-medium">{farm?.district || "N/A"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Village</span>
                <span className="font-medium">{farm?.village || "N/A"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Land Coordinates</span>
                <span className="font-medium">
                  {mapCoords.length > 0 ? `${mapCoords.length} points mapped` : "N/A"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Land Status</span>
                <span className="inline-flex items-center rounded-full bg-green-100 text-green-700 px-2.5 py-0.5 text-xs font-medium">
                  Active
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Added On</span>
                <span className="font-medium">{toDisplayDate(kyc.updated_at)}</span>
              </div>
            </div>
          </div>

          {/* Map */}
          <div className="col-span-5 rounded-xl border overflow-hidden bg-white flex flex-col">
            {mapCenter ? (
              <>
                <div className="flex-1" style={{ minHeight: 260 }}>
                  <MapContainer
                    center={mapCenter}
                    zoom={15}
                    style={{ height: "100%", width: "100%", minHeight: 260 }}
                    scrollWheelZoom={false}
                  >
                    <TileLayer
                      url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                      attribution='Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics'
                    />
                    {mapCoords.length >= 3 && (
                      <Polygon
                        positions={mapCoords}
                        pathOptions={{ color: "var(--land-boundary-color, #fde047)", fillColor: "var(--land-boundary-fill, #fef9c3)", weight: 3, fillOpacity: 0.28 }}
                      />
                    )}
                  </MapContainer>
                </div>
                <div className="border-t text-center py-2.5 bg-white">
                  <button className="text-sm text-gray-700 font-medium hover:text-green-700 transition-colors">
                    View Full Map
                  </button>
                </div>
              </>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground text-sm">
                No land coordinates available
              </div>
            )}
          </div>

          {/* Agreement Summary */}
          <div className="col-span-4 rounded-xl border bg-white p-4 flex flex-col">
            <div className="font-semibold mb-4">Agreement Summary</div>
            <div className="space-y-3 text-sm flex-1">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Agreement Start Date</span>
                <span className="font-medium">{toDisplayDate(agreement.agreement_start_date)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Agreement End Date</span>
                <span className="font-medium">{toDisplayDate(agreement.agreement_end_date)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Lease Rent</span>
                <span className="font-medium">
                  ₹{Number(agreement.lease_rent || 0).toLocaleString("en-IN")} / year
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Agreement Status</span>
                <span className="inline-flex items-center rounded-full bg-green-100 text-green-700 px-2.5 py-0.5 text-xs font-medium">
                  Active
                </span>
              </div>
            </div>
            <Button variant="outline" className="w-full mt-4 gap-2">
              <FileText className="h-4 w-4" /> View Agreement
            </Button>
          </div>

        </div>
      </div>
    </div>
  );
};

export default FarmerProfile;
