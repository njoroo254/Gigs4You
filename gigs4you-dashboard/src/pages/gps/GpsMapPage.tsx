import LiveMap from '../../components/maps/LiveMap'
import { MapPin } from 'lucide-react'

export default function GpsMapPage() {
  return (
    <div className="fade-in">
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
          <MapPin size={20} style={{ color: 'var(--green)' }} />
          Live GPS Tracking
        </h1>
        <p style={{ color: 'var(--text-3)', fontSize: 13, marginTop: 4 }}>
          Real-time location of all checked-in field agents
        </p>
      </div>
      <LiveMap />
    </div>
  )
}
