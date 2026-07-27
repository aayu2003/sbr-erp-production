import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Lead } from '@/types/farm';
import { Check, X, MapPin, Phone, Droplets, FileText, Clock } from 'lucide-react';
import { MapContainer, TileLayer, Polygon, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

interface VerificationModalProps {
  open: boolean;
  onClose: () => void;
  lead: Lead | null;
  onVerify: () => void;
  onReject: () => void;
  onFollowUp?: (note: string) => void;
}

const VerificationModal = ({ open, onClose, lead, onVerify, onReject, onFollowUp }: VerificationModalProps) => {
  if (!lead) return null;

  const [showFollowUpForm, setShowFollowUpForm] = useState(false);
  const [followUpNote, setFollowUpNote] = useState('');

  // Fix default marker icon paths for Leaflet
  const DefaultIcon = L.icon({
    iconUrl: iconUrl as string,
    shadowUrl: iconShadow as string,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
  });
  // @ts-ignore - mutate Leaflet Marker prototype so markers render correctly
  L.Marker.prototype.options.icon = DefaultIcon;

  // Normalize landCoordinates to LatLng tuples [[lat,lng], ...]
  const normalizedCoords: [number, number][] | null = (() => {
    const raw = lead.landCoordinates as any;
    if (!raw) return null;
    if (!Array.isArray(raw) || raw.length === 0) return null;
    // If array of objects {lat,lng}
    if (typeof raw[0] === 'object' && raw[0] !== null && 'lat' in raw[0]) {
      return raw.map((c: any) => [Number(c.lat), Number(c.lng)]);
    }
    // If array of arrays [lat, lng]
    if (Array.isArray(raw[0]) && raw[0].length >= 2) {
      return raw.map((c: any) => [Number(c[0]), Number(c[1])]);
    }
    // If a flat numeric array [lat, lng]
    if (typeof raw[0] === 'number' && raw.length >= 2) {
      return [[Number(raw[0]), Number(raw[1])]];
    }
    return null;
  })();

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl font-display">Verify Lead</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 pt-4">
          {/* Farmer Info */}
          <div className="p-4 bg-secondary rounded-lg space-y-3">
            <h3 className="font-semibold text-lg">{lead.fullName}</h3>
            
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Phone className="w-4 h-4" />
                <span>{lead.phoneNumber}</span>
              </div>
              
              <div className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="w-4 h-4" />
                <span>{lead.village}, {lead.district}</span>
              </div>
              
              <div className="flex items-center gap-2 text-muted-foreground">
                <Droplets className="w-4 h-4" />
                <span>Water: {lead.waterAvailable ? 'Available' : 'Not Available'}</span>
              </div>
              
              <div className="flex items-center gap-2 text-muted-foreground">
                <FileText className="w-4 h-4" />
                <span>{lead.estimatedLandArea || 'N/A'} acres</span>
              </div>
            </div>

            {lead.notes && (
              <div className="pt-2 border-t border-border">
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium">Notes:</span> {lead.notes}
                </p>
              </div>
            )}
          </div>

          {/* Interactive Map Preview: show polygon or marker in a Leaflet map */}
          {(normalizedCoords || lead.location) && (
            <div className="aspect-video rounded-lg overflow-hidden bg-muted">
              <MapContainer
                center={
                  normalizedCoords
                    ? [normalizedCoords[0][0], normalizedCoords[0][1]]
                    : [lead.location!.lat, lead.location!.lng]
                }
                zoom={15}
                style={{ height: '100%', width: '100%' }}
                scrollWheelZoom={false}
              >
                <TileLayer
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                  attribution='Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'
                />
                {normalizedCoords ? (
                  <>
                    <Polygon positions={normalizedCoords as any} pathOptions={{ color: 'var(--land-boundary-color, #fde047)', fillColor: 'var(--land-boundary-fill, #fef9c3)', fillOpacity: 0.28, weight: 3 }} />
                    <Marker position={[normalizedCoords[0][0], normalizedCoords[0][1]] as any}>
                      <Popup>Lead land mapping (first point)</Popup>
                    </Marker>
                  </>
                ) : (
                  <Marker position={[lead.location!.lat, lead.location!.lng] as any}>
                    <Popup>Lead location</Popup>
                  </Marker>
                )}
              </MapContainer>
            </div>
          )}

          {/* Actions */}
          <div className="pt-4 border-t">
            {showFollowUpForm ? (
              <div className="space-y-3">
                <textarea
                  value={followUpNote}
                  onChange={(e) => setFollowUpNote(e.target.value)}
                  placeholder="Enter reason for follow-up..."
                  className="w-full h-28 p-2 border rounded resize-y"
                />
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => { setShowFollowUpForm(false); setFollowUpNote(''); }}
                  >
                    Cancel
                  </Button>
                  <Button
                    className="flex-1 bg-amber-600 hover:bg-amber-700"
                    onClick={() => {
                      onFollowUp?.(followUpNote.trim());
                      setShowFollowUpForm(false);
                      setFollowUpNote('');
                    }}
                  >
                    Save Note
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1 border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
              onClick={onReject}
            >
              <X className="w-4 h-4 mr-2" />
              Reject
            </Button>

            <Button
              variant="outline"
              className="flex-1 border-amber-200 text-amber-700 hover:bg-amber-50"
              onClick={() => setShowFollowUpForm(true)}
            >
              <Clock className="w-4 h-4 mr-2" />
              Follow Up
            </Button>

            <Button
              className="flex-1"
              onClick={onVerify}
            >
              <Check className="w-4 h-4 mr-2" />
              Verify
            </Button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default VerificationModal;
