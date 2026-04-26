import React from 'react'
import type { LucideIcon } from 'lucide-react'

type CardProps = {
  title: string
  value?: string | number
  subtitle?: string
  icon?: LucideIcon
  color?: string
  bg?: string
  onClick?: () => void
  aiHint?: string[]
  loading?: boolean
}

export default function Card({ title, value, subtitle, icon: Icon, color = 'var(--text-1)', bg = 'var(--green-pale)', onClick, aiHint, loading }: CardProps) {
  if (loading) {
    return (
      <div className={"card" + (onClick ? ' clickable' : '')} style={{ padding: 20, position: 'relative', cursor: onClick ? 'pointer' : 'default', minHeight: 88 }}>
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
            <div style={{ width:'60%', height:12, background:'#e5e7eb', borderRadius:6 }} />
            {Icon && <div style={{ width:44, height:44, borderRadius:10, background:bg }} />}
          </div>
          <div style={{ width:'40%', height:12, background:'#e5e7eb', borderRadius:6 }} />
        </div>
        {aiHint && aiHint.length > 0 && (
          <div className="ai-hint" style={{ position:'absolute', right:12, bottom:12, width:210, padding:8, borderRadius:8, background:'#fff', border:'1px solid var(--border)', boxShadow:'0 6px 16px rgba(0,0,0,0.08)', opacity:0, transform:'translateY(6px)', transition:'all 0.2s ease' }} />
        )}
      </div>
    )
  }
  const content = (
    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <div>
          <div style={{ fontSize:12, color:'var(--text-3)', fontWeight:500, textTransform:'uppercase' }}>{title}</div>
          {typeof value !== 'undefined' && (
            <div style={{ fontSize:26, fontWeight:700, color: 'var(--text-1)' }}>{value}</div>
          )}
          {subtitle && (
            <div style={{ fontSize:11, color:'var(--text-4)' }}>{subtitle}</div>
          )}
        </div>
        {Icon && (
          <div style={{ width:44, height:44, borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', background:bg }}>
            <Icon size={20} color={color} />
          </div>
        )}
      </div>
    </div>
  )
  return (
    <div className={"card" + (onClick ? ' clickable' : '')} onClick={onClick} style={{ padding: 20, position: 'relative', cursor: onClick ? 'pointer' : 'default' }}>
      {content}
      {aiHint && aiHint.length > 0 && (
        <div className="ai-hint" style={{ position:'absolute', right:12, bottom:12, width: 210, padding:8, borderRadius:8, background:'#fff', border:'1px solid var(--border)', boxShadow:'0 6px 16px rgba(0,0,0,0.08)', opacity:0, transform:'translateY(6px)', transition:'all 0.2s ease' }}>
          {aiHint.map((h, idx) => (
            <div key={idx} style={{ fontSize:12, color:'var(--text-2)', paddingTop: idx?6:0 }}>{h}</div>
          ))}
        </div>
      )}
    </div>
  )
}
