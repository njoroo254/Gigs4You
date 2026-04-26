import { LucideIcon } from 'lucide-react'

interface Props {
  label: string
  value: string | number
  icon: LucideIcon
  color?: string
  change?: string
  changeUp?: boolean
}

export default function StatCard({ label, value, icon: Icon, color = 'var(--green)', change, changeUp }: Props) {
  return (
    <div className="card fade-in" style={{ padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 500, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {label}
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-1)', lineHeight: 1 }}>
            {value}
          </div>
          {change && (
            <div style={{ fontSize: 12, marginTop: 8, color: changeUp ? 'var(--green)' : 'var(--danger)', fontWeight: 500 }}>
              {changeUp ? '↑' : '↓'} {change}
            </div>
          )}
        </div>
        <div style={{
          width: 44, height: 44, borderRadius: 12,
          background: `${color}18`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={20} color={color} />
        </div>
      </div>
    </div>
  )
}
