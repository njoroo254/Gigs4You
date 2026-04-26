import { useEffect, useRef, useState, useCallback } from 'react'
import L from 'leaflet'
import { getLiveAgents } from '../../api/api'
import { RefreshCw, MapPin } from 'lucide-react'

// Fix default marker icon paths broken by bundlers
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

interface AgentPin {
  id: string
  lastLatitude:  number
  lastLongitude: number
  lastSeenAt:    string
  status:        string
  user?: { name: string }
}

// Custom circular marker icon with agent initial
function agentIcon(initial: string, selected = false) {
  const bg   = selected ? '#0D5C2E' : '#1B6B3A'
  const size = selected ? 36 : 30
  const html = `
    <div style="
      width:${size}px;height:${size}px;border-radius:50%;
      background:${bg};border:3px solid #fff;
      box-shadow:0 2px 8px rgba(0,0,0,0.35);
      display:flex;align-items:center;justify-content:center;
      font-family:DM Sans,sans-serif;font-weight:700;
      font-size:${selected ? 14 : 12}px;color:#fff;">
      ${initial}
    </div>`
  return L.divIcon({ html, className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2] })
}

// Reverse-geocode a lat/lng to a human-readable place name using Nominatim
const geocodeCache = new Map<string, string>()
async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`
  if (geocodeCache.has(key)) return geocodeCache.get(key)!
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=14`,
      { headers: { 'Accept-Language': 'en', 'User-Agent': 'Gigs4You Dashboard/1.0' } }
    )
    const data = await res.json()
    const parts = [
      data.address?.suburb || data.address?.neighbourhood || data.address?.village,
      data.address?.city   || data.address?.town          || data.address?.county,
    ].filter(Boolean)
    const name = parts.length ? parts.join(', ') : (data.display_name?.split(',')[0] || key)
    geocodeCache.set(key, name)
    return name
  } catch {
    return key
  }
}

export default function LiveMap() {
  const mapRef     = useRef<L.Map | null>(null)
  const mapDivRef  = useRef<HTMLDivElement>(null)
  const markersRef = useRef<Map<string, L.Marker>>(new Map())

  const [agents,   setAgents]   = useState<AgentPin[]>([])
  const [selected, setSelected] = useState<AgentPin | null>(null)
  const [selPlace, setSelPlace] = useState<string>('')
  const [loading,  setLoading]  = useState(false)

  // ── Init map once ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return

    const map = L.map(mapDivRef.current, {
      center:    [-1.286, 36.820],  // Nairobi CBD
      zoom:      12,
      zoomControl: true,
    })

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map)

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // ── Load agents — only checked_in ─────────────────────────────────────
  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const data: AgentPin[] = await getLiveAgents()
      // Only show agents who are checked in
      const checkedIn = (Array.isArray(data) ? data : []).filter(a => a.status === 'checked_in')
      setAgents(checkedIn)
      updateMarkers(checkedIn)
    } catch {
      // keep current markers
    } finally {
      setLoading(false)
    }
  }, [])

  function updateMarkers(list: AgentPin[]) {
    const map = mapRef.current
    if (!map) return

    const seen = new Set<string>()

    for (const agent of list) {
      const lat = Number(agent.lastLatitude)
      const lng = Number(agent.lastLongitude)
      if (!lat || !lng) continue

      const initial = agent.user?.name?.[0]?.toUpperCase() || 'A'
      seen.add(agent.id)

      const existing = markersRef.current.get(agent.id)
      if (existing) {
        existing.setLatLng([lat, lng])
        existing.setIcon(agentIcon(initial, selected?.id === agent.id))
      } else {
        const marker = L.marker([lat, lng], { icon: agentIcon(initial) })
          .addTo(map)
          .bindTooltip(agent.user?.name || 'Agent', { permanent: false, direction: 'top' })
          .on('click', () => handleSelectAgent(agent))
        markersRef.current.set(agent.id, marker)
      }
    }

    // Remove stale markers (agents who checked out)
    for (const [id, marker] of markersRef.current.entries()) {
      if (!seen.has(id)) {
        marker.remove()
        markersRef.current.delete(id)
      }
    }
  }

  async function handleSelectAgent(agent: AgentPin) {
    const map = mapRef.current
    if (!map) return

    setSelected(prev => {
      const next = prev?.id === agent.id ? null : agent

      // Update all marker icons to reflect new selection
      for (const [id, marker] of markersRef.current.entries()) {
        const a = agents.find(x => x.id === id)
        const initial = a?.user?.name?.[0]?.toUpperCase() || 'A'
        marker.setIcon(agentIcon(initial, id === next?.id))
      }

      if (next) {
        map.setView([Number(next.lastLatitude), Number(next.lastLongitude)], 15, { animate: true })
      }

      return next
    })

    // Reverse-geocode selected agent's location
    if (agent) {
      const place = await reverseGeocode(Number(agent.lastLatitude), Number(agent.lastLongitude))
      setSelPlace(place)
    } else {
      setSelPlace('')
    }
  }

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, 30_000)
    return () => clearInterval(interval)
  }, [refresh])

  // Re-draw markers when selection changes
  useEffect(() => {
    updateMarkers(agents)
  }, [selected])

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: '16px 20px', display: 'flex',
        alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--green)', animation: 'pulse 2s infinite' }} />
          <span style={{ fontWeight: 600, fontSize: 14 }}>Live agent map</span>
          <span className="badge badge-green">{agents.length} checked in</span>
        </div>
        <button onClick={refresh} className="btn btn-ghost" style={{ padding: '6px 10px' }}>
          <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          Refresh
        </button>
      </div>

      {/* Map container */}
      <div style={{ position: 'relative' }}>
        {agents.length === 0 && !loading && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 500,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            background: 'rgba(240,244,240,0.80)', pointerEvents: 'none',
          }}>
            <MapPin size={32} color="var(--text-4)" style={{ marginBottom: 8 }} />
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-3)' }}>No agents checked in</div>
            <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 4 }}>
              Agents appear here once they check in via the mobile app
            </div>
          </div>
        )}
        <div ref={mapDivRef} style={{ height: 380, width: '100%' }} />
      </div>

      {/* Selected agent info bar */}
      {selected && (
        <div style={{
          padding: '10px 20px', borderTop: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: '#F6FBF7',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%', background: '#1B6B3A',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontWeight: 700, fontSize: 13,
            }}>
              {selected.user?.name?.[0]?.toUpperCase() || 'A'}
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{selected.user?.name || 'Agent'}</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <MapPin size={10} />
                {selPlace || 'Locating…'}
              </div>
            </div>
          </div>
          <button
            className="btn btn-ghost"
            style={{ fontSize: 12, padding: '4px 10px' }}
            onClick={() => { setSelected(null); setSelPlace('') }}>
            Deselect
          </button>
        </div>
      )}
    </div>
  )
}
