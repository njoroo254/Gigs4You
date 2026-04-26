import { useEffect, useState, useRef, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import {
  Send, Search, MessageCircle, Check, CheckCheck,
  Wifi, WifiOff, Edit, Paperclip, X, Users,
  Plus, ChevronLeft, Hash,
} from 'lucide-react'
import {
  api, getConversations, getChatMessages, markConvRead,
  getChatContacts, getGroups, getGroupMessages,
} from '../../api/api'
import { useAuthStore, getIsManager } from '../../store/store'
import { io, Socket } from 'socket.io-client'

// ── Types ────────────────────────────────────────────────────────────────
interface Message {
  id: string; senderId: string; recipientId: string
  body: string; createdAt: string; isRead?: boolean
  messageType?: string; taskId?: string; conversationId?: string
  attachmentUrl?: string; attachmentType?: string
}
interface Conv {
  id: string; conversationId: string; participantA: string; participantB: string
  lastMessageBody?: string; lastMessageAt?: string
  unreadCountA: number; unreadCountB: number
  otherUser?: { id: string; name: string; phone: string; role: string }
}
interface Contact {
  id: string; name: string; phone: string; role: string
}
interface ChatGroup {
  id: string; name: string; createdBy: string; organisationId?: string
  description?: string; createdAt: string; memberCount?: number
  lastMessage?: { body: string; createdAt: string } | null
}
interface GroupMessage {
  id: string; groupId: string; senderId: string; senderName: string
  body: string; createdAt: string; attachmentUrl?: string; messageType?: string
}

// ── Helpers ──────────────────────────────────────────────────────────────
const ROLE_COLORS: Record<string, string> = {
  super_admin: '#F59E0B', admin: '#3B82F6', manager: '#8B5CF6',
  supervisor: '#06B6D4', agent: '#10B981', employer: '#EC4899',
}
const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin', admin: 'Admin', manager: 'Manager',
  supervisor: 'Supervisor', agent: 'Agent', employer: 'Employer', worker: 'Worker',
}
const GROUP_CREATOR_ROLES = ['super_admin', 'admin', 'manager']

function isImageUrl(url: string): boolean {
  return /\.(jpe?g|png|gif|webp|bmp|svg)(\?.*)?$/i.test(url) || url.includes('image')
}
function isPdfUrl(url: string): boolean {
  return /\.pdf(\?.*)?$/i.test(url) || url.includes('/documents/')
}
function fileLabel(url: string): string {
  const name = url.split('/').pop()?.split('?')[0] || 'file'
  return name.length > 30 ? name.slice(0, 27) + '…' : name
}
function initials(name: string): string {
  const p = name.trim().split(' ')
  return p.length >= 2 ? (p[0][0] + p[1][0]).toUpperCase() : (name[0]?.toUpperCase() || '?')
}
function timeStr(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// ── Component ─────────────────────────────────────────────────────────────
export default function ChatPage() {
  const { user }        = useAuthStore()
  const isManager       = getIsManager(user)
  const canCreateGroup  = GROUP_CREATOR_ROLES.includes(user?.role)
  const location        = useLocation()
  const startWith       = (location.state as any)?.startWith as string | undefined
  const startWithName   = (location.state as any)?.name    as string | undefined

  // ── DM state ─────────────────────────────────────────────────────────
  const [convs, setConvs]       = useState<Conv[]>([])
  const [selected, setSel]      = useState<Conv | null>(null)
  const [messages, setMsgs]     = useState<Message[]>([])
  const [dmSearch, setDmSearch] = useState('')
  const [loading, setLoading]   = useState(true)

  // ── Group state ───────────────────────────────────────────────────────
  const [groups, setGroups]             = useState<ChatGroup[]>([])
  const [selectedGroup, setSelGroup]    = useState<ChatGroup | null>(null)
  const [groupMessages, setGroupMsgs]   = useState<GroupMessage[]>([])
  const [groupSearch, setGroupSearch]   = useState('')

  // ── Contacts panel state ──────────────────────────────────────────────
  const [contacts, setContacts]       = useState<Contact[]>([])
  const [showContacts, setShowContacts] = useState(false)
  const [contactSearch, setContactSearch] = useState('')

  // ── Group creation modal ──────────────────────────────────────────────
  const [showCreateGroup, setShowCreateGroup] = useState(false)
  const [newGroupName, setNewGroupName]       = useState('')
  const [newGroupDesc, setNewGroupDesc]       = useState('')
  const [selectedMembers, setSelectedMembers] = useState<string[]>([])
  const [memberSearch, setMemberSearch]       = useState('')
  const [creating, setCreating]               = useState(false)

  // ── Tab: 'dms' | 'groups' ─────────────────────────────────────────────
  const [tab, setTab] = useState<'dms' | 'groups'>('dms')

  // ── Compose (existing DM compose) ─────────────────────────────────────
  const [showCompose, setShowCompose]     = useState(false)
  const [composeSearch, setComposeSearch] = useState('')

  // ── Shared input state ────────────────────────────────────────────────
  const [draft, setDraft]           = useState('')
  const [sending, setSending]       = useState(false)
  const [attachmentUrl, setAttachmentUrl] = useState<string | null>(null)
  const [uploading, setUploading]   = useState(false)
  const [lightbox, setLightbox]     = useState<string | null>(null)

  // ── Real-time ─────────────────────────────────────────────────────────
  const [wsStatus, setWsStatus] = useState<'connecting'|'connected'|'disconnected'>('connecting')
  const [typing, setTyping]     = useState<Record<string, boolean>>({})
  const [online, setOnline]     = useState<Record<string, boolean>>({})

  const socketRef    = useRef<Socket | null>(null)
  const bottomRef    = useRef<HTMLDivElement>(null)
  const typingTimer  = useRef<any>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── WebSocket setup ───────────────────────────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) return
    const apiUrl    = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1'
    const url       = new URL(apiUrl)
    const socketUrl = `${url.protocol}//${url.host}/chat`

    const sock = io(socketUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 5000,
    })
    socketRef.current = sock

    sock.on('connect', () => {
      setWsStatus('connected')
      getConversations().then((data: Conv[]) => { if (Array.isArray(data)) setConvs(data) }).catch(() => {})
    })
    sock.on('disconnect', () => setWsStatus('disconnected'))
    sock.on('connect_error', () => setWsStatus('disconnected'))

    // DM events
    sock.on('new_message', (msg: Message) => {
      setMsgs(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg])
      setConvs(prev => prev.map(c =>
        c.conversationId === [user?.id, msg.senderId].sort().join(':')
          ? { ...c, lastMessageBody: msg.body, lastMessageAt: msg.createdAt }
          : c,
      ))
      scrollToBottom()
    })
    sock.on('message_sent', (msg: Message) => {
      setMsgs(prev => {
        const withoutOpt = prev.filter(m => !(m.id.startsWith('opt-') && m.body === msg.body))
        return withoutOpt.some(m => m.id === msg.id) ? withoutOpt : [...withoutOpt, msg]
      })
      setConvs(prev => prev.map(c =>
        c.conversationId === msg.conversationId
          ? { ...c, lastMessageBody: msg.body, lastMessageAt: msg.createdAt }
          : c,
      ))
      scrollToBottom()
    })
    sock.on('user_typing', ({ userId, isTyping }: any) => {
      setTyping(prev => ({ ...prev, [userId]: isTyping }))
    })
    sock.on('messages_read', ({ byUserId }: any) => {
      setMsgs(prev => prev.map(m => m.recipientId === byUserId ? { ...m, isRead: true } : m))
    })
    sock.on('presence_update', ({ userId, online: isOnline }: any) => {
      setOnline(prev => ({ ...prev, [userId]: isOnline }))
    })
    sock.on('presence_result', (presence: Record<string, boolean>) => {
      if (presence) setOnline(prev => ({ ...prev, ...presence }))
    })

    // Group events
    sock.on('new_group_message', (msg: GroupMessage) => {
      if (selectedGroupRef.current?.id === msg.groupId) {
        setGroupMsgs(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg])
        scrollToBottom()
      }
      // Update last message preview
      setGroups(prev => prev.map(g =>
        g.id === msg.groupId
          ? { ...g, lastMessage: { body: msg.body, createdAt: msg.createdAt } }
          : g,
      ))
    })
    sock.on('group_created', (group: ChatGroup) => {
      setGroups(prev => [group, ...prev.filter(g => g.id !== group.id)])
    })

    return () => { sock.disconnect() }
  }, [])

  // keep selectedGroup in a ref so the WS event can read current value
  const selectedGroupRef = useRef<ChatGroup | null>(null)
  useEffect(() => { selectedGroupRef.current = selectedGroup }, [selectedGroup])

  // Seed presence on connect
  useEffect(() => {
    if (wsStatus !== 'connected' || convs.length === 0) return
    const ids = convs.map(c => c.participantA === user?.id ? c.participantB : c.participantA)
    socketRef.current?.emit('get_presence', { userIds: ids })
  }, [wsStatus, convs.length])

  // ── Load initial data ─────────────────────────────────────────────────
  useEffect(() => {
    getConversations().then((data: Conv[]) => {
      const list = Array.isArray(data) ? data : []
      setConvs(list)
      setLoading(false)
      if (startWith) {
        const existing = list.find(c => c.participantA === startWith || c.participantB === startWith)
        if (existing) {
          setSel(existing)
        } else if (isManager) {
          setSel({
            id: `pending-${startWith}`,
            conversationId: `pending-${startWith}`,
            participantA: user?.id, participantB: startWith,
            unreadCountA: 0, unreadCountB: 0,
            otherUser: { id: startWith, name: startWithName || startWith.slice(0, 8), phone: '', role: 'agent' },
          })
        }
      }
    }).catch(() => setLoading(false))

    // Load contacts and groups in parallel
    getChatContacts().then((data: Contact[]) => { if (Array.isArray(data)) setContacts(data) }).catch(() => {})
    getGroups().then((data: ChatGroup[]) => { if (Array.isArray(data)) setGroups(data) }).catch(() => {})
  }, [])

  // ── Load DM messages when conv selected ──────────────────────────────
  useEffect(() => {
    if (!selected) return
    const otherId = getOtherId(selected)
    getChatMessages(otherId, 60).then((msgs: Message[]) => {
      setMsgs(Array.isArray(msgs) ? msgs : [])
      scrollToBottom()
    })
    markConvRead(otherId).catch(() => {})
    socketRef.current?.emit('mark_read', { otherUserId: otherId })
    socketRef.current?.emit('get_presence', { userIds: [otherId] })
    setSelGroup(null)
  }, [selected])

  // ── Load group messages when group selected ───────────────────────────
  useEffect(() => {
    if (!selectedGroup) return
    getGroupMessages(selectedGroup.id, 60).then((msgs: GroupMessage[]) => {
      setGroupMsgs(Array.isArray(msgs) ? msgs : [])
      scrollToBottom()
    })
    setSel(null)
  }, [selectedGroup])

  // ── Helpers ───────────────────────────────────────────────────────────
  const getOtherId   = (conv: Conv) => conv.participantA === user?.id ? conv.participantB : conv.participantA
  const scrollToBottom = () => setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  const myUnread     = (c: Conv) => c.participantA === user?.id ? c.unreadCountA : c.unreadCountB
  const isOtherTyping  = selected ? typing[getOtherId(selected)] : false
  const isOtherOnline  = selected ? online[getOtherId(selected)] : false

  // ── File upload ───────────────────────────────────────────────────────
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await api.post('/upload/chat-attachment', form, { headers: { 'Content-Type': 'multipart/form-data' } })
      setAttachmentUrl(res.data?.url || null)
    } catch { alert('File upload failed. Please try again.') }
    finally { setUploading(false); e.target.value = '' }
  }

  // ── Send DM ───────────────────────────────────────────────────────────
  const sendDm = useCallback(async () => {
    if ((!draft.trim() && !attachmentUrl) || !selected || sending) return
    const body     = draft.trim() || (attachmentUrl ? '📎 Attachment' : '')
    const otherId  = getOtherId(selected)
    setDraft(''); setSending(true)
    const sendAtt  = attachmentUrl; setAttachmentUrl(null)
    socketRef.current?.emit('typing', { recipientId: otherId, isTyping: false })

    const tempId = `opt-${Date.now()}`
    setMsgs(prev => [...prev, { id: tempId, senderId: user!.id, recipientId: otherId, body, createdAt: new Date().toISOString() }])
    scrollToBottom()

    const viaRest = async () => {
      try {
        const res = await api.post(`/chat/conversations/${otherId}/messages`, { body, attachmentUrl: sendAtt ?? undefined })
        setMsgs(prev => {
          const wo = prev.filter(m => m.id !== tempId)
          return wo.some(m => m.id === res.data.id) ? wo : [...wo, res.data]
        })
        scrollToBottom()
      } catch { setMsgs(prev => prev.filter(m => m.id !== tempId)) }
    }

    if (wsStatus === 'connected' && socketRef.current) {
      socketRef.current.emit('send_message', { recipientId: otherId, body, attachmentUrl: sendAtt ?? undefined }, (ack: any) => {
        if (ack?.error) viaRest()
      })
    } else {
      await viaRest()
    }
    setSending(false)
  }, [draft, selected, sending, wsStatus, user, attachmentUrl])

  // ── Send group message ────────────────────────────────────────────────
  const sendGroupMsg = useCallback(async () => {
    if ((!draft.trim() && !attachmentUrl) || !selectedGroup || sending) return
    const body    = draft.trim() || (attachmentUrl ? '📎 Attachment' : '')
    const groupId = selectedGroup.id
    setDraft(''); setSending(true)
    const sendAtt = attachmentUrl; setAttachmentUrl(null)

    const tempId = `opt-${Date.now()}`
    const tempMsg: GroupMessage = {
      id: tempId, groupId, senderId: user!.id,
      senderName: user?.name || 'Me', body, createdAt: new Date().toISOString(),
    }
    setGroupMsgs(prev => [...prev, tempMsg])
    scrollToBottom()

    if (wsStatus === 'connected' && socketRef.current) {
      socketRef.current.emit('send_group_message', { groupId, body, attachmentUrl: sendAtt ?? undefined }, (ack: any) => {
        if (ack?.error) {
          // fallback to REST
          api.post(`/chat/groups/${groupId}/messages`, { body, attachmentUrl: sendAtt ?? undefined })
            .then(res => {
              setGroupMsgs(prev => {
                const wo = prev.filter(m => m.id !== tempId)
                return wo.some(m => m.id === res.data.id) ? wo : [...wo, res.data]
              })
              scrollToBottom()
            })
            .catch(() => setGroupMsgs(prev => prev.filter(m => m.id !== tempId)))
        } else if (ack?.id) {
          // replace optimistic
          setGroupMsgs(prev => {
            const wo = prev.filter(m => m.id !== tempId)
            return wo.some(m => m.id === ack.id) ? wo : [...wo, ack]
          })
        }
      })
    } else {
      try {
        const res = await api.post(`/chat/groups/${groupId}/messages`, { body, attachmentUrl: sendAtt ?? undefined })
        setGroupMsgs(prev => {
          const wo = prev.filter(m => m.id !== tempId)
          return wo.some(m => m.id === res.data.id) ? wo : [...wo, res.data]
        })
        scrollToBottom()
      } catch { setGroupMsgs(prev => prev.filter(m => m.id !== tempId)) }
    }
    setSending(false)
  }, [draft, selectedGroup, sending, wsStatus, user, attachmentUrl])

  const send = () => (selectedGroup ? sendGroupMsg() : sendDm())

  // ── Typing indicator ──────────────────────────────────────────────────
  const handleDraftChange = (v: string) => {
    setDraft(v)
    if (!selected) return
    const otherId = getOtherId(selected)
    socketRef.current?.emit('typing', { recipientId: otherId, isTyping: true })
    clearTimeout(typingTimer.current)
    typingTimer.current = setTimeout(() => {
      socketRef.current?.emit('typing', { recipientId: otherId, isTyping: false })
    }, 2000)
  }

  // ── Create group ──────────────────────────────────────────────────────
  const handleCreateGroup = async () => {
    if (!newGroupName.trim() || selectedMembers.length === 0) return
    setCreating(true)
    try {
      const group = await api.post('/chat/groups', {
        name: newGroupName.trim(),
        memberIds: selectedMembers,
        description: newGroupDesc.trim() || undefined,
      }).then(r => r.data)
      setGroups(prev => [group, ...prev])
      setShowCreateGroup(false)
      setNewGroupName(''); setNewGroupDesc(''); setSelectedMembers([]); setMemberSearch('')
      setTab('groups')
      setSelGroup(group)
    } catch { alert('Failed to create group. Please try again.') }
    finally { setCreating(false) }
  }

  const toggleMember = (id: string) =>
    setSelectedMembers(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  // ── Filtered lists ────────────────────────────────────────────────────
  const filteredConvs   = convs.filter(c => !dmSearch || c.otherUser?.name?.toLowerCase().includes(dmSearch.toLowerCase()) || c.lastMessageBody?.toLowerCase().includes(dmSearch.toLowerCase()))
  const filteredGroups  = groups.filter(g => !groupSearch || g.name.toLowerCase().includes(groupSearch.toLowerCase()))
  const filteredContacts = contacts.filter(c => !contactSearch || c.name?.toLowerCase().includes(contactSearch.toLowerCase()) || c.role?.toLowerCase().includes(contactSearch.toLowerCase()))

  // ── Attachment rendering helper ───────────────────────────────────────
  const renderAttachment = (url: string, isMine: boolean) => {
    if (isImageUrl(url)) return (
      <img src={url} alt="attachment" onClick={() => setLightbox(url)}
        style={{ display: 'block', maxWidth: 240, maxHeight: 180, borderRadius: 8, cursor: 'zoom-in', objectFit: 'cover' }} />
    )
    return (
      <div onClick={() => setLightbox(url)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '8px 10px',
          background: isMine ? 'rgba(255,255,255,0.15)' : 'var(--white)',
          borderRadius: 8, border: '1px solid var(--border)' }}>
        <span style={{ fontSize: 22 }}>{isPdfUrl(url) ? '📄' : '📎'}</span>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600 }}>{fileLabel(url)}</div>
          <div style={{ fontSize: 10, opacity: 0.6 }}>
            Click to view ·{' '}
            <a href={url} download target="_blank" rel="noopener noreferrer"
              onClick={e => e.stopPropagation()} style={{ color: 'inherit' }}>Download</a>
          </div>
        </div>
      </div>
    )
  }

  // ── Styles ────────────────────────────────────────────────────────────
  const tabBtn = (active: boolean) => ({
    flex: 1, padding: '7px 0', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer',
    borderRadius: 7,
    background: active ? 'var(--green)' : 'transparent',
    color: active ? '#fff' : 'var(--text-3)',
    transition: 'all 0.15s',
  } as React.CSSProperties)

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Lightbox ── */}
      {lightbox && (
        <div onClick={() => setLightbox(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' }}>
          {isPdfUrl(lightbox)
            ? <iframe src={lightbox} style={{ width: '90vw', height: '90vh', border: 'none', borderRadius: 8 }} />
            : <img src={lightbox} alt="attachment" onClick={e => e.stopPropagation()}
                style={{ maxWidth: '92vw', maxHeight: '92vh', borderRadius: 8, boxShadow: '0 8px 40px rgba(0,0,0,0.6)' }} />}
          <button onClick={() => setLightbox(null)}
            style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(255,255,255,0.15)',
              border: 'none', borderRadius: '50%', width: 36, height: 36, color: '#fff',
              cursor: 'pointer', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
          <a href={lightbox} download target="_blank" rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            style={{ position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
              background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: 8, padding: '8px 20px', color: '#fff', fontSize: 13, textDecoration: 'none' }}>
            ⬇ Download
          </a>
        </div>
      )}

      {/* ── Create Group Modal ── */}
      {showCreateGroup && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9000,
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShowCreateGroup(false)}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: 'var(--white)', borderRadius: 16, padding: 24, width: 420,
              maxHeight: '80vh', display: 'flex', flexDirection: 'column', gap: 16,
              boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 700, fontSize: 16 }}>New Group</span>
              <button onClick={() => setShowCreateGroup(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}>
                <X size={16} color="var(--text-3)" />
              </button>
            </div>

            {/* Group name */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', display: 'block', marginBottom: 4 }}>
                GROUP NAME *
              </label>
              <input className="inp" placeholder="e.g. Nairobi Field Team"
                value={newGroupName} onChange={e => setNewGroupName(e.target.value)} />
            </div>

            {/* Description (optional) */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', display: 'block', marginBottom: 4 }}>
                DESCRIPTION (optional)
              </label>
              <input className="inp" placeholder="What is this group for?"
                value={newGroupDesc} onChange={e => setNewGroupDesc(e.target.value)} />
            </div>

            {/* Member picker */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)' }}>
                  ADD MEMBERS ({selectedMembers.length} selected)
                </label>
              </div>
              {/* Search within contacts */}
              <div style={{ position: 'relative', marginBottom: 8 }}>
                <Search size={12} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-4)' }} />
                <input className="inp" placeholder="Search contacts…" style={{ paddingLeft: 28, fontSize: 12 }}
                  value={memberSearch} onChange={e => setMemberSearch(e.target.value)} />
              </div>
              {/* Selected pills */}
              {selectedMembers.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
                  {selectedMembers.map(mid => {
                    const c = contacts.find(x => x.id === mid)
                    return c ? (
                      <div key={mid}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px',
                          background: 'var(--green-pale)', borderRadius: 99, fontSize: 11, color: 'var(--green)' }}>
                        {c.name.split(' ')[0]}
                        <button onClick={() => toggleMember(mid)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: 'var(--green)' }}>
                          <X size={10} />
                        </button>
                      </div>
                    ) : null
                  })}
                </div>
              )}
              {/* Contact list */}
              <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 10 }}>
                {contacts
                  .filter(c => !memberSearch || c.name?.toLowerCase().includes(memberSearch.toLowerCase()))
                  .map(c => {
                    const sel = selectedMembers.includes(c.id)
                    const rc  = ROLE_COLORS[c.role] || 'var(--green)'
                    return (
                      <div key={c.id} onClick={() => toggleMember(c.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
                          cursor: 'pointer', borderBottom: '1px solid var(--border)',
                          background: sel ? 'var(--green-pale)' : 'transparent',
                          transition: 'background 0.1s' }}
                        onMouseEnter={e => !sel && (e.currentTarget.style.background = 'var(--surface)')}
                        onMouseLeave={e => e.currentTarget.style.background = sel ? 'var(--green-pale)' : 'transparent'}>
                        <div style={{ width: 30, height: 30, borderRadius: '50%', background: rc,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                          {initials(c.name)}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{c.name}</div>
                          <div style={{ fontSize: 10, color: 'var(--text-4)' }}>{ROLE_LABELS[c.role] || c.role}</div>
                        </div>
                        {sel && (
                          <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--green)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <Check size={10} color="#fff" />
                          </div>
                        )}
                      </div>
                    )
                  })}
                {contacts.filter(c => !memberSearch || c.name?.toLowerCase().includes(memberSearch.toLowerCase())).length === 0 && (
                  <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-4)', fontSize: 12 }}>No contacts found</div>
                )}
              </div>
            </div>

            {/* Create button */}
            <button
              onClick={handleCreateGroup}
              disabled={!newGroupName.trim() || selectedMembers.length === 0 || creating}
              className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
              {creating ? 'Creating…' : `Create Group${selectedMembers.length > 0 ? ` (${selectedMembers.length + 1})` : ''}`}
            </button>
          </div>
        </div>
      )}

      {/* ── Main layout ── */}
      <div className="fade-in" style={{ height: 'calc(100vh - 100px)', display: 'flex', gap: 0,
        border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', background: 'var(--white)' }}>

        {/* ── Contacts panel (slide-in) ── */}
        {showContacts && (
          <div style={{ width: 260, borderRight: '1px solid var(--border)', display: 'flex',
            flexDirection: 'column', flexShrink: 0, background: 'var(--surface)' }}>
            {/* Header */}
            <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>Contacts</span>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {canCreateGroup && (
                    <button
                      onClick={() => setShowCreateGroup(true)}
                      title="Create a group from contacts"
                      style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 9px',
                        background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 7,
                        fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                      <Plus size={11} /> Group
                    </button>
                  )}
                  <button onClick={() => setShowContacts(false)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', color: 'var(--text-3)' }}>
                    <ChevronLeft size={16} />
                  </button>
                </div>
              </div>
              <div style={{ position: 'relative' }}>
                <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-4)' }} />
                <input className="inp" placeholder="Search…" style={{ paddingLeft: 26, fontSize: 12 }}
                  value={contactSearch} onChange={e => setContactSearch(e.target.value)} />
              </div>
            </div>

            {/* Contact count */}
            <div style={{ padding: '6px 14px', fontSize: 10, color: 'var(--text-4)', fontWeight: 600, letterSpacing: '0.5px' }}>
              {filteredContacts.length} CONTACTS
            </div>

            {/* Contact list */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {filteredContacts.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-4)', fontSize: 12 }}>No contacts</div>
              ) : filteredContacts.map(c => {
                const rc = ROLE_COLORS[c.role] || 'var(--green)'
                return (
                  <div key={c.id}
                    onClick={() => {
                      // Open or create DM with this contact
                      const existing = convs.find(cv => cv.participantA === c.id || cv.participantB === c.id)
                      if (existing) { setSel(existing); setTab('dms') }
                      else {
                        setSel({
                          id: `pending-${c.id}`, conversationId: `pending-${c.id}`,
                          participantA: user!.id, participantB: c.id,
                          unreadCountA: 0, unreadCountB: 0,
                          otherUser: { id: c.id, name: c.name, phone: c.phone, role: c.role },
                        })
                        setTab('dms')
                      }
                      setShowContacts(false)
                    }}
                    style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 14px',
                      cursor: 'pointer', transition: 'background 0.1s', borderBottom: '1px solid var(--border)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(27,107,58,0.06)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      <div style={{ width: 34, height: 34, borderRadius: '50%', background: rc,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 12, fontWeight: 700, color: '#fff' }}>
                        {initials(c.name)}
                      </div>
                      {online[c.id] && (
                        <div style={{ position: 'absolute', bottom: 0, right: 0, width: 9, height: 9,
                          background: 'var(--green)', borderRadius: '50%', border: '2px solid var(--surface)' }} />
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                      <div style={{ fontSize: 10, color: rc, fontWeight: 600 }}>{ROLE_LABELS[c.role] || c.role}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Left sidebar (conversations + groups) ── */}
        <div style={{ width: 290, borderRight: '1px solid var(--border)', display: 'flex',
          flexDirection: 'column', flexShrink: 0 }}>

          {/* Header */}
          <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontWeight: 700, fontSize: 15 }}>Messages</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11,
                  color: wsStatus === 'connected' ? 'var(--green)' : 'var(--text-4)' }}>
                  {wsStatus === 'connected' ? <><Wifi size={11} /> Live</> : <><WifiOff size={11} /> Offline</>}
                </div>
                {/* Contacts toggle */}
                <button onClick={() => setShowContacts(v => !v)} title="Contacts"
                  style={{ width: 28, height: 28, border: 'none', borderRadius: 7, cursor: 'pointer',
                    background: showContacts ? 'var(--green)' : 'var(--surface)',
                    color: showContacts ? '#fff' : 'var(--text-3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Users size={13} />
                </button>
                {/* Compose DM */}
                <button onClick={() => setShowCompose(v => !v)} title="New message"
                  style={{ width: 28, height: 28, border: 'none', borderRadius: 7, cursor: 'pointer',
                    background: showCompose ? 'var(--green-pale)' : 'var(--surface)',
                    color: showCompose ? 'var(--green)' : 'var(--text-3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Edit size={13} />
                </button>
              </div>
            </div>

            {/* Compose picker */}
            {showCompose && (
              <div style={{ marginBottom: 10, background: 'var(--surface)', borderRadius: 10,
                border: '1px solid var(--border)', overflow: 'hidden' }}>
                <div style={{ padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 6,
                  borderBottom: '1px solid var(--border)' }}>
                  <Search size={12} color="var(--text-4)" />
                  <input autoFocus placeholder="Search contacts…" value={composeSearch}
                    onChange={e => setComposeSearch(e.target.value)}
                    style={{ flex: 1, border: 'none', outline: 'none', fontSize: 12,
                      background: 'transparent', color: 'var(--text-1)' }} />
                </div>
                <div style={{ maxHeight: 180, overflowY: 'auto' }}>
                  {contacts
                    .filter(c => !composeSearch || c.name?.toLowerCase().includes(composeSearch.toLowerCase()))
                    .map(c => (
                      <div key={c.id}
                        onClick={() => {
                          const existing = convs.find(cv => cv.participantA === c.id || cv.participantB === c.id)
                          if (existing) { setSel(existing) } else {
                            setSel({ id: `pending-${c.id}`, conversationId: `pending-${c.id}`,
                              participantA: user!.id, participantB: c.id,
                              unreadCountA: 0, unreadCountB: 0,
                              otherUser: { id: c.id, name: c.name, phone: c.phone, role: c.role } })
                          }
                          setShowCompose(false); setComposeSearch('')
                        }}
                        style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px',
                          cursor: 'pointer', fontSize: 12 }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--green-pale)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--green)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 10, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                          {initials(c.name)}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600 }}>{c.name}</div>
                          <div style={{ color: 'var(--text-4)', fontSize: 10 }}>{ROLE_LABELS[c.role] || c.role}</div>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 4, background: 'var(--surface)', borderRadius: 9, padding: 3 }}>
              <button style={tabBtn(tab === 'dms')} onClick={() => setTab('dms')}>
                DMs {convs.filter(c => myUnread(c) > 0).length > 0 && `(${convs.filter(c => myUnread(c) > 0).length})`}
              </button>
              <button style={tabBtn(tab === 'groups')} onClick={() => setTab('groups')}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
                  <Hash size={11} /> Groups {groups.length > 0 ? `(${groups.length})` : ''}
                </span>
              </button>
            </div>

            {/* Search */}
            <div style={{ position: 'relative', marginTop: 8 }}>
              <Search size={12} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)',
                color: 'var(--text-4)', pointerEvents: 'none' }} />
              <input className="inp" placeholder={tab === 'dms' ? 'Search messages…' : 'Search groups…'}
                style={{ paddingLeft: 28, fontSize: 12 }}
                value={tab === 'dms' ? dmSearch : groupSearch}
                onChange={e => tab === 'dms' ? setDmSearch(e.target.value) : setGroupSearch(e.target.value)} />
            </div>
          </div>

          {/* List area */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {tab === 'dms' ? (
              loading ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-4)', fontSize: 13 }}>Loading…</div>
              ) : filteredConvs.length === 0 ? (
                <div style={{ padding: 32, textAlign: 'center' }}>
                  <MessageCircle size={32} color="var(--text-4)" style={{ marginBottom: 8 }} />
                  <div style={{ fontSize: 13, color: 'var(--text-3)' }}>No conversations yet</div>
                  <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 4 }}>Click the contacts icon to start one</div>
                </div>
              ) : filteredConvs.map(c => {
                const otherId  = getOtherId(c)
                const isActive = selected?.id === c.id && !selectedGroup
                const unread   = myUnread(c)
                const isOnline = online[otherId]
                const name     = c.otherUser?.name || otherId.slice(0, 10)
                return (
                  <div key={c.id} onClick={() => { setSel(c); setSelGroup(null) }}
                    style={{ padding: '11px 14px', cursor: 'pointer', display: 'flex', gap: 10,
                      alignItems: 'center', transition: 'background 0.1s',
                      background: isActive ? 'var(--green-pale)' : 'transparent',
                      borderLeft: isActive ? '3px solid var(--green)' : '3px solid transparent' }}
                    onMouseEnter={e => !isActive && (e.currentTarget.style.background = 'var(--surface)')}
                    onMouseLeave={e => !isActive && (e.currentTarget.style.background = 'transparent')}>
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      <div style={{ width: 36, height: 36, borderRadius: '50%', background: ROLE_COLORS[c.otherUser?.role || ''] || 'var(--green)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff' }}>
                        {initials(name)}
                      </div>
                      {isOnline && <div style={{ position: 'absolute', bottom: 0, right: 0, width: 10, height: 10,
                        background: 'var(--green)', borderRadius: '50%', border: '2px solid var(--white)' }} />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 13, fontWeight: unread > 0 ? 700 : 500,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>{name}</span>
                        {c.lastMessageAt && <span style={{ fontSize: 10, color: 'var(--text-4)', flexShrink: 0 }}>{timeStr(c.lastMessageAt)}</span>}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 170, fontWeight: unread > 0 ? 600 : 400 }}>
                        {typing[otherId] ? <em style={{ color: 'var(--green)' }}>typing…</em> : (c.lastMessageBody || 'No messages yet')}
                      </div>
                    </div>
                    {unread > 0 && <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--green)', color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{unread > 9 ? '9+' : unread}</div>}
                  </div>
                )
              })
            ) : (
              // Groups tab
              <>
                {canCreateGroup && (
                  <div style={{ padding: '10px 14px' }}>
                    <button onClick={() => setShowCreateGroup(true)}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        padding: '8px 0', background: 'var(--green-pale)', color: 'var(--green)',
                        border: '1px dashed var(--green)', borderRadius: 9, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      <Plus size={13} /> New Group
                    </button>
                  </div>
                )}
                {filteredGroups.length === 0 ? (
                  <div style={{ padding: 32, textAlign: 'center' }}>
                    <Hash size={32} color="var(--text-4)" style={{ marginBottom: 8 }} />
                    <div style={{ fontSize: 13, color: 'var(--text-3)' }}>No groups yet</div>
                    {canCreateGroup && <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 4 }}>Click "New Group" above to create one</div>}
                  </div>
                ) : filteredGroups.map(g => {
                  const isActive = selectedGroup?.id === g.id
                  return (
                    <div key={g.id} onClick={() => { setSelGroup(g); setSel(null) }}
                      style={{ padding: '11px 14px', cursor: 'pointer', display: 'flex', gap: 10,
                        alignItems: 'center', transition: 'background 0.1s',
                        background: isActive ? 'var(--green-pale)' : 'transparent',
                        borderLeft: isActive ? '3px solid var(--green)' : '3px solid transparent' }}
                      onMouseEnter={e => !isActive && (e.currentTarget.style.background = 'var(--surface)')}
                      onMouseLeave={e => !isActive && (e.currentTarget.style.background = 'transparent')}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: '#6366F1',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Hash size={15} color="#fff" />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>{g.name}</span>
                          {g.lastMessage?.createdAt && <span style={{ fontSize: 10, color: 'var(--text-4)', flexShrink: 0 }}>{timeStr(g.lastMessage.createdAt)}</span>}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 170 }}>
                          {g.lastMessage?.body || `${g.memberCount ?? '?'} members`}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </>
            )}
          </div>
        </div>

        {/* ── Message pane ── */}
        {!selected && !selectedGroup ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', background: 'var(--surface)' }}>
            <MessageCircle size={48} color="var(--border)" style={{ marginBottom: 12 }} />
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-3)' }}>
              {tab === 'groups' ? 'Select a group' : 'Select a conversation'}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-4)', marginTop: 4 }}>
              {isManager
                ? 'Or click the contacts icon to browse and message people'
                : 'Your manager will contact you here'}
            </div>
          </div>
        ) : selectedGroup ? (
          // ── Group message pane ──
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            {/* Group header */}
            <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: '#6366F1',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Hash size={16} color="#fff" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{selectedGroup.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-4)' }}>
                  {selectedGroup.memberCount ? `${selectedGroup.memberCount} members` : 'Group'}
                  {selectedGroup.description ? ` · ${selectedGroup.description}` : ''}
                </div>
              </div>
              <button onClick={() => setSelGroup(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', color: 'var(--text-3)' }}>
                <X size={16} />
              </button>
            </div>

            {/* Group messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {groupMessages.map(m => {
                const isMine = m.senderId === user?.id
                return (
                  <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isMine ? 'flex-end' : 'flex-start' }}>
                    {!isMine && (
                      <div style={{ fontSize: 10, fontWeight: 700, color: ROLE_COLORS['manager'], marginBottom: 2, paddingLeft: 4 }}>
                        {m.senderName}
                      </div>
                    )}
                    <div style={{ maxWidth: '72%', padding: '9px 13px', borderRadius: 12,
                      borderBottomRightRadius: isMine ? 2 : 12,
                      borderBottomLeftRadius: isMine ? 12 : 2,
                      background: isMine ? 'var(--green)' : 'var(--surface)',
                      color: isMine ? '#fff' : 'var(--text-1)',
                      border: isMine ? 'none' : '1px solid var(--border)' }}>
                      {m.attachmentUrl && renderAttachment(m.attachmentUrl, isMine)}
                      {m.body && m.body !== '📎 Attachment' && (
                        <div style={{ fontSize: 13, lineHeight: 1.5, wordBreak: 'break-word', marginTop: m.attachmentUrl ? 6 : 0 }}>{m.body}</div>
                      )}
                      <div style={{ fontSize: 10, opacity: 0.7, marginTop: 3, textAlign: 'right' }}>{timeStr(m.createdAt)}</div>
                    </div>
                  </div>
                )
              })}
              <div ref={bottomRef} />
            </div>

            {/* Group input */}
            <div style={{ borderTop: '1px solid var(--border)' }}>
              {attachmentUrl && (
                <div style={{ padding: '8px 16px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                  {isImageUrl(attachmentUrl)
                    ? <img src={attachmentUrl} alt="preview" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer' }} onClick={() => setLightbox(attachmentUrl)} />
                    : <span style={{ fontSize: 20 }}>{isPdfUrl(attachmentUrl) ? '📄' : '📎'}</span>}
                  <div style={{ fontSize: 12, color: 'var(--green)', flex: 1 }}>{fileLabel(attachmentUrl)}</div>
                  <button onClick={() => setAttachmentUrl(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}><X size={14} /></button>
                </div>
              )}
              <div style={{ padding: '12px 16px', display: 'flex', gap: 8, alignItems: 'center' }}>
                <input ref={fileInputRef} type="file" hidden accept="image/*,.pdf,.doc,.docx" onChange={handleFileChange} />
                <button onClick={() => fileInputRef.current?.click()} disabled={uploading} title="Attach file"
                  style={{ width: 34, height: 34, border: '1px solid var(--border)', borderRadius: 8,
                    background: 'var(--surface)', color: 'var(--text-3)', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Paperclip size={15} />
                </button>
                <input className="inp" placeholder={`Message #${selectedGroup.name}…`} style={{ flex: 1 }}
                  value={draft} onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send())} />
                <button onClick={send} disabled={(!draft.trim() && !attachmentUrl) || sending}
                  className="btn btn-primary" style={{ padding: '9px 16px', gap: 5 }}>
                  <Send size={14} />
                </button>
              </div>
            </div>
          </div>
        ) : selected ? (
          // ── DM message pane ──
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            {/* DM header */}
            <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ position: 'relative' }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%',
                  background: ROLE_COLORS[selected.otherUser?.role || ''] || 'var(--green)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: '#fff' }}>
                  {initials(selected.otherUser?.name || getOtherId(selected))}
                </div>
                {isOtherOnline && <div style={{ position: 'absolute', bottom: 0, right: 0, width: 10, height: 10,
                  background: 'var(--green)', borderRadius: '50%', border: '2px solid var(--white)' }} />}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{selected.otherUser?.name || getOtherId(selected).slice(0, 12)}</div>
                <div style={{ fontSize: 11, color: isOtherOnline ? 'var(--green)' : 'var(--text-4)' }}>
                  {isOtherTyping ? '✍️ typing…' : isOtherOnline ? 'Online' : 'Offline'}
                  {selected.otherUser?.role && <span style={{ color: ROLE_COLORS[selected.otherUser.role], marginLeft: 6, fontWeight: 600 }}>· {ROLE_LABELS[selected.otherUser.role]}</span>}
                </div>
              </div>
            </div>

            {/* DM messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {messages.map(m => {
                const isMine = m.senderId === user?.id
                return (
                  <div key={m.id} style={{ display: 'flex', justifyContent: isMine ? 'flex-end' : 'flex-start' }}>
                    <div style={{ maxWidth: '72%', padding: m.attachmentUrl ? '6px' : '9px 13px', borderRadius: 12,
                      borderBottomRightRadius: isMine ? 2 : 12,
                      borderBottomLeftRadius: isMine ? 12 : 2,
                      background: isMine ? 'var(--green)' : 'var(--surface)',
                      color: isMine ? '#fff' : 'var(--text-1)',
                      border: isMine ? 'none' : '1px solid var(--border)' }}>
                      {m.attachmentUrl && renderAttachment(m.attachmentUrl, isMine)}
                      {m.body && m.body !== '📎 Attachment' && (
                        <div style={{ fontSize: 13, lineHeight: 1.5, wordBreak: 'break-word',
                          marginTop: m.attachmentUrl ? 6 : 0, padding: m.attachmentUrl ? '0 6px 4px' : 0 }}>{m.body}</div>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 3,
                        justifyContent: 'flex-end', padding: m.attachmentUrl ? '0 6px 4px' : 0 }}>
                        <span style={{ fontSize: 10, opacity: 0.7 }}>{timeStr(m.createdAt)}</span>
                        {isMine && (m.isRead ? <CheckCheck size={11} color="#60d6a9" /> : <Check size={11} style={{ opacity: 0.5 }} />)}
                      </div>
                    </div>
                  </div>
                )
              })}
              {isOtherTyping && (
                <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                  <div style={{ padding: '10px 14px', borderRadius: 12, background: 'var(--surface)',
                    border: '1px solid var(--border)', display: 'flex', gap: 3, alignItems: 'center' }}>
                    {[0, 1, 2].map(i => (
                      <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-4)',
                        animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite` }} />
                    ))}
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* DM input */}
            {(!selected.id.startsWith('pending-') || isManager) ? (
              <div style={{ borderTop: '1px solid var(--border)' }}>
                {attachmentUrl && (
                  <div style={{ padding: '8px 16px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                    {isImageUrl(attachmentUrl)
                      ? <img src={attachmentUrl} alt="preview" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer' }} onClick={() => setLightbox(attachmentUrl)} />
                      : <span style={{ fontSize: 20 }}>{isPdfUrl(attachmentUrl) ? '📄' : '📎'}</span>}
                    <div style={{ fontSize: 12, color: 'var(--green)', flex: 1 }}>{fileLabel(attachmentUrl)}</div>
                    <button onClick={() => setAttachmentUrl(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}><X size={14} /></button>
                  </div>
                )}
                <div style={{ padding: '12px 16px', display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input ref={fileInputRef} type="file" hidden accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" onChange={handleFileChange} />
                  <button onClick={() => fileInputRef.current?.click()} disabled={uploading} title="Attach file"
                    style={{ width: 34, height: 34, border: '1px solid var(--border)', borderRadius: 8,
                      background: 'var(--surface)', color: 'var(--text-3)', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Paperclip size={15} />
                  </button>
                  <input className="inp" placeholder="Type a message…" style={{ flex: 1 }}
                    value={draft} onChange={e => handleDraftChange(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send())} />
                  <button onClick={send} disabled={(!draft.trim() && !attachmentUrl) || sending}
                    className="btn btn-primary" style={{ padding: '9px 16px', gap: 5 }}>
                    <Send size={14} />
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ padding: '14px 16px', borderTop: '1px solid var(--border)',
                textAlign: 'center', fontSize: 12, color: 'var(--text-4)' }}>
                Your manager will contact you here
              </div>
            )}
          </div>
        ) : null}
      </div>

      <style>{`
        @keyframes bounce {
          0%,80%,100% { transform: translateY(0); }
          40% { transform: translateY(-6px); }
        }
      `}</style>
    </>
  )
}
