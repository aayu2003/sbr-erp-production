import { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Loader2, ArrowRight, ArrowLeft, MapPin, Check, Info, Navigation, ImagePlus, Video, X, UploadCloud } from 'lucide-react';
import { MapContainer, TileLayer, FeatureGroup, Marker, Polygon, useMap } from 'react-leaflet';
import L from 'leaflet';
import { EditControl } from 'react-leaflet-draw';
import getBaseUrl from '@/lib/config';
import { useToast } from '@/hooks/use-toast';
import { parseKmlFile } from '@/lib/kmlParser';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';

interface AddLeadModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: AddLeadFormData) => Promise<void>;
}

export interface AddLeadFormData {
  fullName: string;
  phoneNumber: string;
  alternatePhone?: string;
  leadSource: string;
  farmingOption?: string;
  village: string;
  tehsil?: string;
  district: string;
  state: string;
  estimatedLandArea?: number;
  waterAvailable: boolean;
  notes?: string;
  landLocation?: { lat: number; lng: number } | null;
  landCoordinates?: { lat: number; lng: number }[];
  landImages?: File[];
  landVideo?: File | null;
}

// Animates the map to fit the given coords whenever they change
const FlyToBounds = ({ coords }: { coords: { lat: number; lng: number }[] | null }) => {
  const map = useMap();
  useEffect(() => {
    if (!coords || coords.length === 0) return;
    const latLngs = coords.map(c => L.latLng(c.lat, c.lng));
    map.flyToBounds(L.latLngBounds(latLngs), { padding: [40, 40], duration: 1.4, animate: true });
  }, [coords]);
  return null;
};

const AddLeadModal = ({ open, onClose, onSubmit }: AddLeadModalProps) => {
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'info' | 'location' | 'media' | 'mapping'>('info');
  const [skipMapping, setSkipMapping] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>({ lat: 22.5726, lng: 78.9629 });
  const [landLocation, setLandLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [landImages, setLandImages] = useState<(File | null)[]>([null, null, null]);
  const [landImagePreviews, setLandImagePreviews] = useState<(string | null)[]>([null, null, null]);
  const [landVideo, setLandVideo] = useState<File | null>(null);
  const [landVideoPreview, setLandVideoPreview] = useState<string | null>(null);
  const [kmlCoordinates, setKmlCoordinates] = useState<{ lat: number; lng: number }[] | null>(null);
  const [isParsingKml, setIsParsingKml] = useState(false);
  const featureGroupRef = useRef(null);
  const imageInputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const { toast } = useToast();

  const [formData, setFormData] = useState<AddLeadFormData>({
    fullName: '',
    phoneNumber: '',
    alternatePhone: '',
    leadSource: '',
    farmingOption: '',
    village: '',
    tehsil: '',
    district: '',
    state: '',
    estimatedLandArea: undefined,
    waterAvailable: false,
    notes: '',
    landCoordinates: [],
  });

  const getUserLocation = async () => {
    setLocationLoading(true);
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        });
      });
      setMapCenter({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      });
    } catch (error) {
      console.error('Error getting location:', error);
      alert('Unable to get your location. Using default location.');
    } finally {
      setLocationLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      setStep('info');
      setSkipMapping(false);
      setLandLocation(null);
      setLandImages([null, null, null]);
      setLandImagePreviews([null, null, null]);
      setLandVideo(null);
      setLandVideoPreview(null);
      setKmlCoordinates(null);
      setFormData({
        fullName: '',
        phoneNumber: '',
        alternatePhone: '',
        leadSource: '',
        farmingOption: '',
        village: '',
        tehsil: '',
        district: '',
        state: '',
        estimatedLandArea: undefined,
        waterAvailable: false,
        notes: '',
        landCoordinates: [],
      });
    }
  }, [open]);

  useEffect(() => {
    if ((step === 'location' || step === 'media' || step === 'mapping') && !landLocation) {
      getUserLocation();
    }
  }, [step]);

  useEffect(() => {
    return () => {
      landImagePreviews.forEach((preview) => {
        if (preview) URL.revokeObjectURL(preview);
      });
      if (landVideoPreview) URL.revokeObjectURL(landVideoPreview);
    };
  }, [landImagePreviews, landVideoPreview]);

  const handleCanvasClick = () => {
    // No longer needed with leaflet
  };

  const handleMouseMove = () => {
    // No longer needed with leaflet
  };

  const handleUndo = () => {
    // Handled by leaflet draw
  };

  const handleClear = () => {
    // Handled by leaflet draw
  };

  const calculateArea = () => {
    return '0';
  };

  const isInfoValid = () => {
    return formData.fullName && formData.phoneNumber && formData.leadSource && 
           formData.village && formData.district && formData.state;
  };

  const handleNextStep = () => {
    if (isInfoValid()) {
      setStep('location');
    }
  };

  const handleLocationNext = () => {
    if (landLocation) {
      setStep('media');
    }
  };

  const handleMediaNext = () => {
    setStep('mapping');
  };

  const handleImagePick = (index: number, file?: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) return;

    setLandImages((prev) => {
      const next = [...prev];
      next[index] = file;
      return next;
    });

    setLandImagePreviews((prev) => {
      const next = [...prev];
      if (next[index]) URL.revokeObjectURL(next[index] as string);
      next[index] = URL.createObjectURL(file);
      return next;
    });
  };

  const clearImagePick = (index: number) => {
    setLandImages((prev) => {
      const next = [...prev];
      next[index] = null;
      return next;
    });
    setLandImagePreviews((prev) => {
      const next = [...prev];
      if (next[index]) URL.revokeObjectURL(next[index] as string);
      next[index] = null;
      return next;
    });
  };

  const handleVideoPick = (file?: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('video/')) return;
    setLandVideo(file);
    setLandVideoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  };

  const clearVideoPick = () => {
    setLandVideo(null);
    setLandVideoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  };

  const handleKmlUpload = async (file: File) => {
    try {
      setIsParsingKml(true);
      const result = await parseKmlFile(file);
      const coords = result.land_coordinates.map(([lat, lng]) => ({ lat, lng }));
      setKmlCoordinates(coords);
      toast({ title: 'KML loaded', description: `${coords.length} boundary points mapped from file` });
    } catch (err: any) {
      toast({ title: 'KML Error', description: err?.message || 'Failed to read KML file', variant: 'destructive' });
    } finally {
      setIsParsingKml(false);
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      let coordinates: { lat: number; lng: number }[] = [];
      if (!skipMapping) {
        if (kmlCoordinates && kmlCoordinates.length > 0) {
          coordinates = kmlCoordinates;
        } else if (featureGroupRef.current) {
          coordinates = extractCoordinates();
        }
      }

      const selectedImages = landImages.filter((f): f is File => !!f);

      const base = getBaseUrl().replace(/\/$/, '');

      // Step 1: Upload land images — only if user selected any
      let imageUrls: string[] = [];
      if (selectedImages.length > 0) {
        const imagesFormData = new FormData();
        selectedImages.forEach((file) => {
          imagesFormData.append('land_images', file, file.name);
        });
        const imagesResp = await fetch(`${base}/farmer_managment/upload_land_images`, {
          method: 'POST',
          body: imagesFormData,
        });
        if (!imagesResp.ok) throw new Error(`Failed to upload land images (${imagesResp.status})`);
        const imagesResult = await imagesResp.json();
        if (!imagesResult?.success || !Array.isArray(imagesResult?.images)) {
          throw new Error('Image upload API returned invalid response');
        }
        imageUrls = imagesResult.images
          .map((img: any) => img?.url)
          .filter((url: any) => typeof url === 'string' && url.length > 0);
      }

      // Step 2: Upload land video — only if user selected one
      let videoUrl = '';
      if (landVideo) {
        const videoFormData = new FormData();
        videoFormData.append('land_video', landVideo, landVideo.name);
        const videoResp = await fetch(`${base}/farmer_managment/upload_land_video`, {
          method: 'POST',
          body: videoFormData,
        });
        if (!videoResp.ok) throw new Error(`Failed to upload land video (${videoResp.status})`);
        const videoResult = await videoResp.json();
        if (!videoResult?.success || !videoResult?.video?.url) {
          throw new Error('Video upload API returned invalid response');
        }
        videoUrl = videoResult.video.url;
      }

      // Step 3: Create lead with uploaded media URLs
      let landCoordinatesPayload: number[][] = [];
      if (coordinates.length > 0) {
        landCoordinatesPayload = coordinates.map((coord) => [coord.lat, coord.lng]);
      } else if (landLocation) {
        landCoordinatesPayload = [[landLocation.lat, landLocation.lng]];
      }

      const payload = {
        full_name: formData.fullName,
        phone_number: formData.phoneNumber,
        alternate_phone_number: formData.alternatePhone || '',
        lead_source: formData.leadSource,
        farming_option: formData.farmingOption || '',
        village: formData.village,
        tehsil: formData.tehsil || '',
        district: formData.district,
        state: formData.state,
        estimated_land_area: Number(formData.estimatedLandArea || 0),
        water_available: Boolean(formData.waterAvailable),
        note: formData.notes || '',
        land_coordinates: landCoordinatesPayload,
        land_images: imageUrls,
        land_video: videoUrl,
      };

      const leadResp = await fetch(`${base}/farmer_managment/lead_contacted`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!leadResp.ok) throw new Error(`Failed to save lead (${leadResp.status})`);
      const leadResult = await leadResp.json();
      if (!leadResult?.success) throw new Error('Lead save failed');

      const submitData: AddLeadFormData = {
        ...formData,
        landCoordinates: coordinates,
        landLocation: landLocation || undefined,
        landImages: selectedImages,
        landVideo,
      };
      await onSubmit(submitData);
      toast({ title: 'Success', description: 'Lead added successfully', variant: 'success' });
      onClose();
    } catch (error) {
      console.error('Add lead workflow failed:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to add lead',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const extractCoordinates = () => {
    // Extract drawn polygon coordinates from leaflet.
    // Handle nested latlng arrays returned by polygon/rectangle (rings),
    // as well as circle (getLatLng) and single markers.
    const coordinates: { lat: number; lng: number }[] = [];

    const pushLatLng = (ll: any) => {
      if (!ll) return;
      const lat = typeof ll.lat === 'number' ? ll.lat : ll[0];
      const lng = typeof ll.lng === 'number' ? ll.lng : ll[1];
      if (typeof lat === 'number' && typeof lng === 'number') {
        coordinates.push({ lat, lng });
      }
    };

    const flattenAndPush = (obj: any) => {
      if (!obj) return;
      if (Array.isArray(obj)) {
        obj.forEach((item) => flattenAndPush(item));
      } else if (obj.lat !== undefined && obj.lng !== undefined) {
        pushLatLng(obj);
      } else if (obj.hasOwnProperty('lat') || obj.hasOwnProperty('lng')) {
        pushLatLng(obj);
      }
    };

    if (featureGroupRef.current) {
      const layers = (featureGroupRef.current as any).getLayers?.();
      if (layers && Array.isArray(layers)) {
        layers.forEach((layer: any) => {
          try {
            if (typeof layer.getLatLngs === 'function') {
              const latlngs = layer.getLatLngs();
              // latlngs can be nested arrays (rings) or a flat array
              flattenAndPush(latlngs);
            } else if (typeof layer.getLatLng === 'function') {
              // circle / marker
              const ll = layer.getLatLng();
              pushLatLng(ll);
            }
          } catch (e) {
            // ignore malformed layers
            // eslint-disable-next-line no-console
            console.warn('Error extracting latlngs from layer', e);
          }
        });
      }
    }

    return coordinates;
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-display flex items-center gap-2">
            {step === 'info' && <>Add New Lead</>}
            {step === 'location' && <><MapPin className="w-5 h-5 text-primary" />Provide Land Location - {formData.fullName}</>}
            {step === 'media' && <><ImagePlus className="w-5 h-5 text-primary" />Add Land Images & Video - {formData.fullName}</>}
            {step === 'mapping' && <><MapPin className="w-5 h-5 text-primary" />Land Mapping (Optional) - {formData.fullName}</>}
          </DialogTitle>
        </DialogHeader>

        {/* Step Indicator */}
        <div className="flex items-center gap-2 py-2">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${step === 'info' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
            <span className="w-5 h-5 rounded-full bg-background/20 flex items-center justify-center text-xs font-bold">1</span>
            Lead Info
          </div>
          <ArrowRight className="w-4 h-4 text-muted-foreground" />
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${step === 'location' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
            <span className="w-5 h-5 rounded-full bg-background/20 flex items-center justify-center text-xs font-bold">2</span>
            Land Location
          </div>
          <ArrowRight className="w-4 h-4 text-muted-foreground" />
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${step === 'media' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
            <span className="w-5 h-5 rounded-full bg-background/20 flex items-center justify-center text-xs font-bold">3</span>
            Land Media
          </div>
          <ArrowRight className="w-4 h-4 text-muted-foreground" />
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${step === 'mapping' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
            <span className="w-5 h-5 rounded-full bg-background/20 flex items-center justify-center text-xs font-bold">4</span>
            Land Mapping (Optional)
          </div>
        </div>

        {/* Step 1: Info */}
        {step === 'info' && (
          <form onSubmit={(e) => { e.preventDefault(); handleNextStep(); }} className="space-y-6 pt-4">
            {/* ...existing code for info form... */}
            <div className="grid grid-cols-2 gap-4">
              {/* ...existing code for info fields... */}
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name *</Label>
                <Input
                  id="fullName"
                  required
                  value={formData.fullName}
                  onChange={e => setFormData(prev => ({ ...prev, fullName: e.target.value }))}
                  placeholder="Enter farmer's full name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phoneNumber">Phone Number *</Label>
                <Input
                  id="phoneNumber"
                  required
                  value={formData.phoneNumber}
                  onChange={e => setFormData(prev => ({ ...prev, phoneNumber: e.target.value }))}
                  placeholder="+91 XXXXX XXXXX"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="alternatePhone">Alternate Phone</Label>
                <Input
                  id="alternatePhone"
                  value={formData.alternatePhone}
                  onChange={e => setFormData(prev => ({ ...prev, alternatePhone: e.target.value }))}
                  placeholder="+91 XXXXX XXXXX"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="leadSource">Lead Source *</Label>
                <Select
                  value={formData.leadSource}
                  onValueChange={value => setFormData(prev => ({ ...prev, leadSource: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select source" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Field Agent">Field Agent</SelectItem>
                    <SelectItem value="Referral">Referral</SelectItem>
                    <SelectItem value="Digital Campaign">Digital Campaign</SelectItem>
                    <SelectItem value="Village Meeting">Village Meeting</SelectItem>
                    <SelectItem value="Walk-in">Walk-in</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="farmingOption">Farming Option</Label>
                <Select
                  value={formData.farmingOption || ''}
                  onValueChange={value => setFormData(prev => ({ ...prev, farmingOption: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select farming option" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Contract Farming">Contract Farming</SelectItem>
                    <SelectItem value="Lease Farming">Lease Farming</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="village">Village *</Label>
                <Input
                  id="village"
                  required
                  value={formData.village}
                  onChange={e => setFormData(prev => ({ ...prev, village: e.target.value }))}
                  placeholder="Enter village name"
                />
              </div>
                    <div className="space-y-2">
                      <Label htmlFor="tehsil">Tehsil</Label>
                      <Input
                        id="tehsil"
                        value={(formData as any).tehsil}
                        onChange={e => setFormData(prev => ({ ...prev, tehsil: e.target.value }))}
                        placeholder="Enter tehsil"
                      />
                    </div>
              <div className="space-y-2">
                <Label htmlFor="district">District *</Label>
                <Input
                  id="district"
                  required
                  value={formData.district}
                  onChange={e => setFormData(prev => ({ ...prev, district: e.target.value }))}
                  placeholder="Enter district"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="state">State *</Label>
                <Select
                  value={formData.state}
                  onValueChange={value => setFormData(prev => ({ ...prev, state: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select state" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Andhra Pradesh">Andhra Pradesh</SelectItem>
                    <SelectItem value="Arunachal Pradesh">Arunachal Pradesh</SelectItem>
                    <SelectItem value="Assam">Assam</SelectItem>
                    <SelectItem value="Bihar">Bihar</SelectItem>
                    <SelectItem value="Chhattisgarh">Chhattisgarh</SelectItem>
                    <SelectItem value="Goa">Goa</SelectItem>
                    <SelectItem value="Gujarat">Gujarat</SelectItem>
                    <SelectItem value="Haryana">Haryana</SelectItem>
                    <SelectItem value="Himachal Pradesh">Himachal Pradesh</SelectItem>
                    <SelectItem value="Jharkhand">Jharkhand</SelectItem>
                    <SelectItem value="Karnataka">Karnataka</SelectItem>
                    <SelectItem value="Kerala">Kerala</SelectItem>
                    <SelectItem value="Madhya Pradesh">Madhya Pradesh</SelectItem>
                    <SelectItem value="Maharashtra">Maharashtra</SelectItem>
                    <SelectItem value="Manipur">Manipur</SelectItem>
                    <SelectItem value="Meghalaya">Meghalaya</SelectItem>
                    <SelectItem value="Mizoram">Mizoram</SelectItem>
                    <SelectItem value="Nagaland">Nagaland</SelectItem>
                    <SelectItem value="Odisha">Odisha</SelectItem>
                    <SelectItem value="Punjab">Punjab</SelectItem>
                    <SelectItem value="Rajasthan">Rajasthan</SelectItem>
                    <SelectItem value="Sikkim">Sikkim</SelectItem>
                    <SelectItem value="Tamil Nadu">Tamil Nadu</SelectItem>
                    <SelectItem value="Telangana">Telangana</SelectItem>
                    <SelectItem value="Tripura">Tripura</SelectItem>
                    <SelectItem value="Uttar Pradesh">Uttar Pradesh</SelectItem>
                    <SelectItem value="Uttarakhand">Uttarakhand</SelectItem>
                    <SelectItem value="West Bengal">West Bengal</SelectItem>
                    <SelectItem value="Andaman and Nicobar Islands">Andaman and Nicobar Islands</SelectItem>
                    <SelectItem value="Chandigarh">Chandigarh</SelectItem>
                    <SelectItem value="Dadra and Nagar Haveli and Daman and Diu">Dadra and Nagar Haveli and Daman and Diu</SelectItem>
                    <SelectItem value="Delhi">Delhi</SelectItem>
                    <SelectItem value="Jammu and Kashmir">Jammu and Kashmir</SelectItem>
                    <SelectItem value="Ladakh">Ladakh</SelectItem>
                    <SelectItem value="Lakshadweep">Lakshadweep</SelectItem>
                    <SelectItem value="Puducherry">Puducherry</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="estimatedLandArea">Estimated Land Area (acres)</Label>
                <Input
                  id="estimatedLandArea"
                  type="number"
                  value={formData.estimatedLandArea || ''}
                  onChange={e => setFormData(prev => ({ ...prev, estimatedLandArea: e.target.value ? Number(e.target.value) : undefined }))}
                  placeholder="Enter area in acres"
                />
              </div>
              <div className="space-y-2">
                <Label>Water Available</Label>
                <div className="flex items-center gap-3 pt-2">
                  <Switch
                    checked={formData.waterAvailable}
                    onCheckedChange={checked => setFormData(prev => ({ ...prev, waterAvailable: checked }))}
                  />
                  <span className="text-sm text-muted-foreground">
                    {formData.waterAvailable ? 'Yes' : 'No'}
                  </span>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Any additional notes about this lead..."
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={!isInfoValid()} className="gap-2">
                Next: Land Location
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </form>
        )}

        {/* Step 2: Land Location */}
        {step === 'location' && (
          <div className="space-y-4 pt-4">
            <div className="flex items-start gap-3 p-3 bg-info/10 rounded-lg border border-info/20">
              <Info className="w-5 h-5 text-info mt-0.5 shrink-0" />
              <p className="text-sm text-muted-foreground">
                Confirm or adjust the marker to indicate the main location of your land.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={getUserLocation}
                disabled={locationLoading}
                className="gap-2 flex-1"
              >
                {locationLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Navigation className="w-4 h-4" />
                )}
                {locationLoading ? 'Getting Location...' : 'Use My Location'}
              </Button>
            </div>
            <div className="relative border-2 border-border rounded-lg overflow-hidden h-96">
              <MapContainer
                center={landLocation || mapCenter}
                zoom={18}
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                  attribution='&copy; Esri'
                />
                {/* Draggable marker for land location */}
                {((landLocation || mapCenter) &&
                  <Marker
                    position={landLocation || mapCenter}
                    draggable={true}
                    eventHandlers={{
                      dragend: (e: any) => {
                        const marker = e.target;
                        const pos = marker.getLatLng();
                        setLandLocation({ lat: pos.lat, lng: pos.lng });
                      },
                    }}
                  />
                )}
              </MapContainer>
            </div>
            <div className="flex justify-between gap-3 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => setStep('info')} className="gap-2">
                <ArrowLeft className="w-4 h-4" />
                Back
              </Button>
              <div className="flex gap-3">
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleLocationNext}
                  disabled={!landLocation}
                  className="gap-2"
                >
                  Next: Add Land Images & Video
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Land Media */}
        {step === 'media' && (
          <div className="space-y-5 pt-4">
            <div className="flex items-start gap-3 p-3 bg-info/10 rounded-lg border border-info/20">
              <Info className="w-5 h-5 text-info mt-0.5 shrink-0" />
              <p className="text-sm text-muted-foreground">
                Land images and video are optional. If no media is uploaded, the lead will be saved without media.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[0, 1, 2].map((index) => (
                <div key={index} className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Image {index + 1}</Label>
                  <input
                    ref={(el) => { imageInputRefs.current[index] = el; }}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleImagePick(index, e.target.files?.[0] || null)}
                  />
                  <button
                    type="button"
                    onClick={() => imageInputRefs.current[index]?.click()}
                    className="relative w-full h-36 rounded-lg border-2 border-dashed border-border hover:border-primary/60 bg-muted/20 hover:bg-muted/30 transition flex items-center justify-center overflow-hidden"
                  >
                    {landImagePreviews[index] ? (
                      <img src={landImagePreviews[index] as string} alt={`Land image ${index + 1}`} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <ImagePlus className="w-6 h-6" />
                        <span className="text-xs">Click to upload image</span>
                      </div>
                    )}
                  </button>
                  {landImages[index] && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="truncate text-muted-foreground">{landImages[index]?.name}</span>
                      <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-red-600" onClick={() => clearImagePick(index)}>
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Land Video</Label>
              <input
                ref={videoInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => handleVideoPick(e.target.files?.[0] || null)}
              />
              <button
                type="button"
                onClick={() => videoInputRef.current?.click()}
                className="relative w-full h-40 rounded-lg border-2 border-dashed border-border hover:border-primary/60 bg-muted/20 hover:bg-muted/30 transition flex items-center justify-center overflow-hidden"
              >
                {landVideoPreview ? (
                  <video src={landVideoPreview} className="h-full w-full object-cover" controls />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Video className="w-7 h-7" />
                    <span className="text-sm font-medium">Click to upload land video</span>
                    <span className="text-xs">Optional</span>
                  </div>
                )}
              </button>
              {landVideo && (
                <div className="flex items-center justify-between text-xs">
                  <span className="truncate text-muted-foreground">{landVideo.name}</span>
                  <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-red-600" onClick={clearVideoPick}>
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}
            </div>

            <div className="flex justify-between gap-3 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => setStep('location')} className="gap-2">
                <ArrowLeft className="w-4 h-4" />
                Back
              </Button>
              <div className="flex gap-3">
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleMediaNext}
                  className="gap-2"
                >
                  Next: Land Mapping (Optional)
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Land Mapping (Optional) */}
        {step === 'mapping' && (
          <div className="space-y-4">
            {!skipMapping ? (
              <>
                <div className="flex items-start gap-3 p-3 bg-info/10 rounded-lg border border-info/20">
                  <Info className="w-5 h-5 text-info mt-0.5 shrink-0" />
                  <p className="text-sm text-muted-foreground">
                    Upload a KML file to auto-map the boundary, or use the drawing tools on the map. This step is optional.
                  </p>
                </div>

                {/* KML Upload */}
                <div className="space-y-2">
                  <label
                    className={`flex items-center justify-center gap-3 w-full rounded-lg border-2 border-dashed py-4 px-4 cursor-pointer transition-colors ${
                      isParsingKml
                        ? 'border-primary/40 bg-primary/5 cursor-wait'
                        : kmlCoordinates
                        ? 'border-green-400 bg-green-50'
                        : 'border-border hover:border-primary/50 hover:bg-muted/30'
                    }`}
                  >
                    {isParsingKml ? (
                      <>
                        <Loader2 className="w-5 h-5 text-primary animate-spin shrink-0" />
                        <span className="text-sm font-medium text-primary">Reading KML file…</span>
                      </>
                    ) : kmlCoordinates ? (
                      <>
                        <Check className="w-5 h-5 text-green-600 shrink-0" />
                        <span className="text-sm font-medium text-green-700">
                          KML loaded — {kmlCoordinates.length} boundary points
                        </span>
                        <button
                          type="button"
                          onClick={e => { e.preventDefault(); setKmlCoordinates(null); }}
                          className="ml-auto text-muted-foreground hover:text-red-500 transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <>
                        <UploadCloud className="w-5 h-5 text-muted-foreground shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-foreground">Upload KML file</p>
                          <p className="text-xs text-muted-foreground">Auto-maps the land boundary from the file</p>
                        </div>
                      </>
                    )}
                    {!kmlCoordinates && (
                      <input
                        type="file"
                        accept=".kml,.kmz"
                        className="hidden"
                        disabled={isParsingKml}
                        onChange={e => {
                          const file = e.target.files?.[0];
                          if (file) handleKmlUpload(file);
                          e.target.value = '';
                        }}
                      />
                    )}
                  </label>

                  {kmlCoordinates && (
                    <p className="text-xs text-muted-foreground px-1">
                      KML boundary will be used for land mapping. You can still draw manually on the map to override it.
                    </p>
                  )}
                </div>

                <div className="relative border-2 border-border rounded-lg overflow-hidden h-96">
                  <MapContainer
                    center={landLocation || mapCenter}
                    zoom={18}
                    style={{ height: '100%', width: '100%' }}
                  >
                    <TileLayer
                      url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                      attribution='&copy; Esri'
                    />
                    <FlyToBounds coords={kmlCoordinates} />
                    {kmlCoordinates && kmlCoordinates.length >= 3 && (
                      <Polygon
                        positions={kmlCoordinates.map(c => [c.lat, c.lng] as [number, number])}
                        pathOptions={{ color: '#22c55e', fillColor: '#22c55e', fillOpacity: 0.2, weight: 2.5 }}
                      />
                    )}
                    {kmlCoordinates && kmlCoordinates.length > 0 && (() => {
                      const lat = kmlCoordinates.reduce((s, c) => s + c.lat, 0) / kmlCoordinates.length;
                      const lng = kmlCoordinates.reduce((s, c) => s + c.lng, 0) / kmlCoordinates.length;
                      return <Marker position={[lat, lng]} />;
                    })()}
                    <FeatureGroup ref={featureGroupRef}>
                      <EditControl
                        position="topleft"
                        onEdited={() => {}}
                        onCreated={() => {}}
                        onDeleted={() => {}}
                        draw={{
                          rectangle: true,
                          polygon: true,
                          circle: true,
                          polyline: false,
                          marker: false,
                          circlemarker: false,
                        }}
                      />
                    </FeatureGroup>
                  </MapContainer>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <MapPin className="w-12 h-12 text-muted-foreground mb-3" />
                <p className="font-medium">Land Mapping Skipped</p>
                <p className="text-sm text-muted-foreground mt-1">
                  You can add land details later
                </p>
              </div>
            )}
            <div className="flex justify-between gap-3 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => setStep('media')} className="gap-2">
                <ArrowLeft className="w-4 h-4" />
                Back
              </Button>
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSkipMapping(true)}
                  disabled={skipMapping}
                >
                  {skipMapping ? 'Mapping Skipped' : 'Skip Mapping'}
                </Button>
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleSubmit}
                  disabled={loading}
                  className="gap-2"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  <Check className="w-4 h-4" />
                  Save Lead
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default AddLeadModal;
