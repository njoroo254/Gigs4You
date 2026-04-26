/**
 * AIWidget — Cathy AI Assistant for Gigs4You Dashboard
 *
 * Features:
 * - Full conversation history persisted in localStorage (per user)
 * - Context-aware quick actions that change per page
 * - Typing/thinking indicator with animated dots
 * - Markdown-lite rendering (bold, italic, bullet lists, code, line breaks)
 * - Keyboard shortcut: Ctrl+K / Cmd+K to open/close
 * - Auto-scroll to latest message
 * - Copy message to clipboard on hover
 * - New conversation button (clears history)
 * - AI availability indicator (pings /health on mount)
 * - Graceful error display with retry button
 * - AI response reads `reply` field from FastAPI correctly
 */
import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useLocation } from 'react-router-dom'

interface Message {
  id:        string
  sender:    'user' | 'ai' | 'error'
  text:      string
  time:      string   // ISO string
  retryText?: string  // original user text for retry
}

interface AIWidgetProps { user?: any }

const AI_URL = import.meta.env.VITE_AI_SERVICE || 'http://localhost:8001'
const MAX_HISTORY = 40  // messages kept in localStorage

// ── Context-aware quick actions ────────────────────────────────────────────
const PAGE_ACTIONS: Record<string, string[]> = {
  '/tasks':     ['What tasks are pending?', 'Who are the top agents this week?', 'Show overdue tasks'],
  '/jobs':      ['What jobs are open?', 'How do I post a new job?', 'Which jobs need urgent filling?'],
  '/agents':    ['Show agent performance summary', 'Which agents are inactive?', 'Top agents by rating'],
  '/wallet':    ['Show recent transactions', 'How do I withdraw funds?', 'What is my balance?'],
  '/reports':   ['Summarize platform performance', 'Agent completion rates?', 'Revenue this month?'],
  '/billing':   ['What is my current plan?', 'How do I upgrade?', 'Show invoice history'],
  '/settings':  ['How do I change notifications?', 'What is the AI service status?'],
  '/dashboard': ['Platform overview', 'Any urgent alerts?', 'Top performers this week'],
}
function getQuickActions(pathname: string): string[] {
  const key = Object.keys(PAGE_ACTIONS).find(k => pathname.includes(k))
  return key ? PAGE_ACTIONS[key] : ['What can you help me with?', 'Platform overview', 'Urgent alerts?']
}

// ── localStorage helpers ───────────────────────────────────────────────────
function storageKey(userId?: string) {
  return `cathy_history_${userId || 'anon'}`
}
function loadHistory(userId?: string): Message[] {
  try {
    const raw = localStorage.getItem(storageKey(userId))
    if (!raw) return []
    const msgs: Message[] = JSON.parse(raw)
    return msgs.slice(-MAX_HISTORY)
  } catch { return [] }
}
function saveHistory(userId: string | undefined, msgs: Message[]) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(msgs.slice(-MAX_HISTORY)))
  } catch {}
}
function clearHistory(userId?: string) {
  try { localStorage.removeItem(storageKey(userId)) } catch {}
}

// ── Markdown-lite renderer ─────────────────────────────────────────────────
function renderText(text: string): React.ReactNode[] {
  const lines = text.split('\n')
  const nodes: React.ReactNode[] = []

  lines.forEach((line, li) => {
    // Bullet list
    const bulletMatch = line.match(/^[\s-]*[-*•]\s+(.+)/)
    if (bulletMatch) {
      nodes.push(
        <div key={li} style={{ display: 'flex', gap: 6, marginBottom: 2 }}>
          <span style={{ color: '#4CAF7D', flexShrink: 0 }}>•</span>
          <span>{inlineFormat(bulletMatch[1])}</span>
        </div>
      )
      return
    }
    // Numbered list
    const numMatch = line.match(/^\d+\.\s+(.+)/)
    if (numMatch) {
      const n = nodes.filter(n => (n as any)?.key?.toString().match(/^\d+/)).length + 1
      nodes.push(
        <div key={li} style={{ display: 'flex', gap: 6, marginBottom: 2 }}>
          <span style={{ color: '#4CAF7D', flexShrink: 0, minWidth: 14 }}>{n}.</span>
          <span>{inlineFormat(numMatch[1])}</span>
        </div>
      )
      return
    }
    // Heading
    if (line.startsWith('### ')) {
      nodes.push(<div key={li} style={{ fontWeight: 700, fontSize: 12, marginTop: 6, marginBottom: 2 }}>{line.slice(4)}</div>)
      return
    }
    if (line.startsWith('## ')) {
      nodes.push(<div key={li} style={{ fontWeight: 700, fontSize: 13, marginTop: 8, marginBottom: 2 }}>{line.slice(3)}</div>)
      return
    }
    // Empty line → spacing
    if (!line.trim()) {
      nodes.push(<div key={li} style={{ height: 6 }} />)
      return
    }
    // Normal paragraph
    nodes.push(<div key={li} style={{ marginBottom: 2 }}>{inlineFormat(line)}</div>)
  })
  return nodes
}

function inlineFormat(text: string): React.ReactNode {
  // Process **bold**, *italic*, `code`
  const parts: React.ReactNode[] = []
  let rest = text
  let key = 0

  while (rest.length > 0) {
    const boldIdx  = rest.indexOf('**')
    const italIdx  = rest.indexOf('*')
    const codeIdx  = rest.indexOf('`')

    const indices = [boldIdx, italIdx !== boldIdx ? italIdx : -1, codeIdx]
      .map((i, idx) => ({ i, idx }))
      .filter(x => x.i !== -1)
      .sort((a, b) => a.i - b.i)

    if (!indices.length) { parts.push(rest); break }

    const first = indices[0]
    if (first.i > 0) { parts.push(rest.slice(0, first.i)); rest = rest.slice(first.i) }

    if (rest.startsWith('**')) {
      const end = rest.indexOf('**', 2)
      if (end !== -1) {
        parts.push(<strong key={key++}>{rest.slice(2, end)}</strong>)
        rest = rest.slice(end + 2)
        continue
      }
    }
    if (rest.startsWith('`')) {
      const end = rest.indexOf('`', 1)
      if (end !== -1) {
        parts.push(<code key={key++} style={{ background: 'rgba(255,255,255,0.15)', padding: '1px 5px', borderRadius: 4, fontFamily: 'monospace', fontSize: '0.9em' }}>{rest.slice(1, end)}</code>)
        rest = rest.slice(end + 1)
        continue
      }
    }
    if (rest.startsWith('*')) {
      const end = rest.indexOf('*', 1)
      if (end !== -1) {
        parts.push(<em key={key++}>{rest.slice(1, end)}</em>)
        rest = rest.slice(end + 1)
        continue
      }
    }
    // No matching end found — treat as literal char
    parts.push(rest[0])
    rest = rest.slice(1)
  }
  return <>{parts}</>
}

// ── Animated dots (thinking indicator) ────────────────────────────────────
function ThinkingDots() {
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '8px 12px' }}>
      {[0, 1, 2].map(i => (
        <div
          key={i}
          style={{
            width: 7, height: 7, borderRadius: '50%',
            background: 'rgba(76, 175, 125, 0.8)',
            animation: `cathyDot 1.3s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
    </div>
  )
}

// ── Format timestamp ───────────────────────────────────────────────────────
function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch { return '' }
}

// ── Copy to clipboard ──────────────────────────────────────────────────────
async function copyToClipboard(text: string) {
  try { await navigator.clipboard.writeText(text) } catch {}
}

// ── Main component ─────────────────────────────────────────────────────────
export default function AIWidget({ user }: AIWidgetProps) {
  const location = useLocation()

  const [open,     setOpen]     = useState(false)
  const [query,    setQuery]    = useState('')
  const [thinking, setThinking] = useState(false)
  const [aiOnline, setAiOnline] = useState<boolean | null>(null) // null = checking
  const [messages, setMessages] = useState<Message[]>(() => {
    const hist = loadHistory(user?.id)
    if (hist.length) return hist
    return [{
      id:     'welcome',
      sender: 'ai',
      text:   "Hi! I'm **Cathy**, your Gigs4You AI assistant 👋\n\nI can help you manage tasks, understand reports, answer platform questions, and much more. What can I do for you today?",
      time:   new Date().toISOString(),
    }]
  })
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [convId,   setConvId]   = useState(() => `dashboard-${user?.id || 'anon'}-${Date.now()}`)

  const bottomRef  = useRef<HTMLDivElement>(null)
  const inputRef   = useRef<HTMLTextAreaElement>(null)
  const quickActions = useMemo(() => getQuickActions(location.pathname), [location.pathname])

  // ── Persist history ──────────────────────────────────────────────────────
  useEffect(() => {
    if (messages.length > 1) saveHistory(user?.id, messages)
  }, [messages, user?.id])

  // ── Scroll to bottom when messages change ────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, thinking])

  // ── Keyboard shortcut: Ctrl/Cmd+K ────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(v => !v)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // ── Focus input when opened ───────────────────────────────────────────────
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 80)
  }, [open])

  // ── Check AI service health ───────────────────────────────────────────────
  useEffect(() => {
    fetch(`${AI_URL}/health`)
      .then(r => {
        setAiOnline(r.ok)
      })
      .catch(() => setAiOnline(false))
  }, [])

  // ── Send message ──────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || thinking) return

    const userMsg: Message = {
      id:     `u-${Date.now()}`,
      sender: 'user',
      text:   trimmed,
      time:   new Date().toISOString(),
    }
    setMessages(prev => [...prev, userMsg])
    setQuery('')
    setThinking(true)

    try {
      const token = localStorage.getItem('token')
      const resp = await fetch(`${AI_URL}/chat/assist`, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          conversation_id: convId,
          message:         trimmed,
          user_context: {
            user_id:  user?.id,
            role:     user?.role,
            name:     user?.name,
            platform: 'dashboard',
            page:     location.pathname,
          },
        }),
      })

      if (!resp.ok) {
        let detail = `AI service returned ${resp.status}`
        try {
          const err = await resp.json()
          if (err?.detail) detail = err.detail
        } catch {}
        throw new Error(detail)
      }

      const data = await resp.json()
      // ResponseBuilder wraps reply under data.data.reply
      const replyText: string =
        data?.data?.reply ||   // ResponseBuilder envelope: { data: { reply } }
        data?.reply ||         // flat fallback
        data?.response ||
        'No response from AI.'

      const aiMsg: Message = {
        id:     `a-${Date.now()}`,
        sender: 'ai',
        text:   replyText,
        time:   new Date().toISOString(),
      }
      setMessages(prev => [...prev, aiMsg])
      setAiOnline(true)
    } catch (err) {
      const errText = err instanceof Error ? err.message : 'AI service unavailable.'
      // Show user-friendly error (not raw HTTP message)
      const friendly = errText.includes('503') || errText.includes('502') || errText.includes('ECONNREFUSED')
        ? "I'm having trouble reaching my server right now. Please try again in a moment."
        : errText.length < 200
          ? errText
          : "I ran into an issue. Please try again."

      const errMsg: Message = {
        id:        `e-${Date.now()}`,
        sender:    'error',
        text:      friendly,
        time:      new Date().toISOString(),
        retryText: trimmed,
      }
      setMessages(prev => [...prev, errMsg])
    } finally {
      setThinking(false)
    }
  }, [thinking, convId, user, location.pathname])

  // ── New conversation ──────────────────────────────────────────────────────
  const startNewConversation = () => {
    clearHistory(user?.id)
    const newId = `dashboard-${user?.id || 'anon'}-${Date.now()}`
    setConvId(newId)
    setMessages([{
      id:     'welcome-new',
      sender: 'ai',
      text:   "New conversation started! How can I help you?",
      time:   new Date().toISOString(),
    }])
    setQuery('')
  }

  // ── Copy handler ──────────────────────────────────────────────────────────
  const handleCopy = async (msg: Message) => {
    await copyToClipboard(msg.text)
    setCopiedId(msg.id)
    setTimeout(() => setCopiedId(null), 1500)
  }

  // ── Key handler for textarea ──────────────────────────────────────────────
  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(query)
    }
  }

  // ── Status dot color ──────────────────────────────────────────────────────
  const dotColor = aiOnline === null ? '#888'
    : aiOnline ? '#4CAF7D'
    : '#EF4444'
  const dotTitle = aiOnline === null ? 'Checking AI…'
    : aiOnline ? 'AI service online'
    : 'AI service offline'

  return (
    <>
      {/* ── Keyframe styles (injected once) ── */}
      <style>{`
        @keyframes cathyDot {
          0%,80%,100% { transform: translateY(0); opacity: 0.5; }
          40% { transform: translateY(-5px); opacity: 1; }
        }
        @keyframes cathySlideUp {
          from { opacity: 0; transform: translateY(16px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)   scale(1); }
        }
        @keyframes cathyPulse {
          0%,100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        .cathy-msg-actions { opacity: 0; transition: opacity 0.15s; }
        .cathy-bubble:hover .cathy-msg-actions { opacity: 1; }
        .cathy-quick-btn {
          font-size: 11px; padding: 5px 10px; border-radius: 999px;
          border: 1px solid rgba(76,175,125,0.4); background: rgba(76,175,125,0.08);
          color: #4CAF7D; cursor: pointer; white-space: nowrap;
          transition: background 0.15s, border-color 0.15s;
        }
        .cathy-quick-btn:hover { background: rgba(76,175,125,0.18); border-color: rgba(76,175,125,0.7); }
        .cathy-send-btn {
          border: none; border-radius: 10px; background: #1B6B3A;
          color: #fff; padding: 0 14px; cursor: pointer; height: 38px;
          font-weight: 600; font-size: 13px; transition: background 0.15s; flex-shrink: 0;
        }
        .cathy-send-btn:hover:not(:disabled) { background: #218a49; }
        .cathy-send-btn:disabled { opacity: 0.45; cursor: not-allowed; }
      `}</style>

      {/* ── Floating launcher button ── */}
      <div style={{ position: 'fixed', right: 22, bottom: 22, zIndex: 9000 }}>
        {/* Status dot on launcher */}
        {aiOnline !== null && (
          <div style={{
            position: 'absolute', top: -2, right: -2,
            width: 11, height: 11, borderRadius: '50%',
            background: dotColor,
            border: '2px solid #0d1f18',
            animation: aiOnline === null ? 'cathyPulse 1.5s infinite' : 'none',
          }} title={dotTitle} />
        )}
        <button
          onClick={() => setOpen(v => !v)}
          title={open ? 'Close Cathy (Ctrl+K)' : 'Ask Cathy — AI assistant (Ctrl+K)'}
          style={{
            borderRadius: '999px',
            padding: open ? '10px 18px' : '12px 20px',
            background: open ? '#0d1f18' : '#1B6B3A',
            color: '#fff', fontWeight: 700, fontSize: 14,
            boxShadow: '0 6px 24px rgba(0,0,0,0.28)',
            cursor: 'pointer', transition: 'all 0.2s',
            border: open ? '1px solid rgba(255,255,255,0.15)' : 'none',
          } as any}
        >
          {open ? '✕ Close' : '✨ Ask Cathy'}
        </button>
      </div>

      {/* ── Chat panel ── */}
      {open && (
        <div
          style={{
            position: 'fixed', right: 22, bottom: 76,
            width: 370, height: 560,
            background: '#070f0b',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 16,
            boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            display: 'flex', flexDirection: 'column',
            zIndex: 8999,
            overflow: 'hidden',
            animation: 'cathySlideUp 0.22s ease-out',
          }}
        >
          {/* ── Header ── */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '12px 16px',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(0,0,0,0.3)',
          }}>
            {/* Avatar */}
            <div style={{
              width: 34, height: 34, borderRadius: '50%',
              background: 'linear-gradient(135deg,#1B6B3A,#4CAF7D)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16, flexShrink: 0, position: 'relative',
            }}>
              ✨
              {/* Online dot */}
              <div style={{
                position: 'absolute', bottom: 1, right: 1,
                width: 9, height: 9, borderRadius: '50%',
                background: dotColor, border: '2px solid #070f0b',
              }} title={dotTitle} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#fff' }}>Cathy</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>
                {aiOnline === null ? 'Connecting…'
                  : aiOnline ? 'AI assistant · Online'
                  : 'AI assistant · Offline'}
              </div>
            </div>
            {/* New conversation */}
            <button
              onClick={startNewConversation}
              title="Start new conversation"
              style={{
                background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 8, color: 'rgba(255,255,255,0.6)', fontSize: 11,
                padding: '4px 8px', cursor: 'pointer',
              }}
            >
              New
            </button>
          </div>

          {/* ── Messages ── */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {messages.map(msg => {
              const isUser  = msg.sender === 'user'
              const isError = msg.sender === 'error'

              return (
                <div
                  key={msg.id}
                  className="cathy-bubble"
                  style={{
                    display: 'flex',
                    justifyContent: isUser ? 'flex-end' : 'flex-start',
                    alignItems: 'flex-end',
                    gap: 6,
                    marginBottom: 4,
                  }}
                >
                  {!isUser && (
                    <div style={{
                      width: 22, height: 22, borderRadius: '50%',
                      background: isError ? 'rgba(239,68,68,0.3)' : 'linear-gradient(135deg,#1B6B3A,#4CAF7D)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, flexShrink: 0, marginBottom: 2,
                    }}>
                      {isError ? '⚠' : '✨'}
                    </div>
                  )}

                  <div style={{ maxWidth: '80%', display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start' }}>
                    <div style={{
                      padding: '9px 12px',
                      borderRadius: isUser ? '14px 14px 3px 14px' : '14px 14px 14px 3px',
                      background: isUser
                        ? 'linear-gradient(135deg,#1B6B3A,#218a49)'
                        : isError
                          ? 'rgba(239,68,68,0.15)'
                          : 'rgba(255,255,255,0.09)',
                      border: isError ? '1px solid rgba(239,68,68,0.3)' : 'none',
                      color: '#fff',
                      fontSize: 12.5,
                      lineHeight: 1.55,
                      wordBreak: 'break-word',
                      position: 'relative',
                    }}>
                      {isUser
                        ? msg.text
                        : renderText(msg.text)
                      }

                      {/* Copy + retry actions */}
                      <div className="cathy-msg-actions" style={{
                        display: 'flex', gap: 4,
                        position: 'absolute', top: -26,
                        right: isUser ? 0 : 'auto', left: isUser ? 'auto' : 0,
                      }}>
                        <button
                          onClick={() => handleCopy(msg)}
                          style={{
                            background: 'rgba(30,50,40,0.9)', border: '1px solid rgba(255,255,255,0.12)',
                            borderRadius: 6, color: 'rgba(255,255,255,0.7)', fontSize: 10,
                            padding: '2px 7px', cursor: 'pointer',
                          }}
                        >
                          {copiedId === msg.id ? '✓ Copied' : 'Copy'}
                        </button>
                        {isError && msg.retryText && (
                          <button
                            onClick={() => sendMessage(msg.retryText!)}
                            style={{
                              background: 'rgba(30,50,40,0.9)', border: '1px solid rgba(76,175,125,0.3)',
                              borderRadius: 6, color: '#4CAF7D', fontSize: 10,
                              padding: '2px 7px', cursor: 'pointer',
                            }}
                          >
                            Retry
                          </button>
                        )}
                      </div>
                    </div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', marginTop: 3, paddingInline: 4 }}>
                      {formatTime(msg.time)}
                    </div>
                  </div>
                </div>
              )
            })}

            {/* Thinking indicator */}
            {thinking && (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
                <div style={{
                  width: 22, height: 22, borderRadius: '50%',
                  background: 'linear-gradient(135deg,#1B6B3A,#4CAF7D)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, flexShrink: 0,
                }}>✨</div>
                <div style={{
                  background: 'rgba(255,255,255,0.09)',
                  borderRadius: '14px 14px 14px 3px',
                }}>
                  <ThinkingDots />
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* ── Quick actions ── */}
          {messages.length <= 2 && (
            <div style={{
              padding: '0 12px 8px',
              display: 'flex', flexWrap: 'wrap', gap: 5,
              borderTop: '1px solid rgba(255,255,255,0.05)',
              paddingTop: 8,
            }}>
              {quickActions.map(action => (
                <button
                  key={action}
                  className="cathy-quick-btn"
                  onClick={() => sendMessage(action)}
                  disabled={thinking}
                >
                  {action}
                </button>
              ))}
            </div>
          )}

          {/* ── Input area ── */}
          <div style={{
            borderTop: '1px solid rgba(255,255,255,0.08)',
            padding: '10px 12px',
            background: 'rgba(0,0,0,0.25)',
          }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <div style={{ flex: 1, position: 'relative' }}>
                <textarea
                  ref={inputRef}
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="Ask Cathy… (Enter to send, Shift+Enter for new line)"
                  rows={1}
                  style={{
                    width: '100%',
                    border: '1px solid rgba(255,255,255,0.13)',
                    borderRadius: 10,
                    padding: '8px 40px 8px 10px',
                    background: '#0d1f18',
                    color: '#fff',
                    fontSize: 12.5,
                    resize: 'none',
                    outline: 'none',
                    lineHeight: 1.5,
                    minHeight: 38,
                    maxHeight: 100,
                    boxSizing: 'border-box',
                    fontFamily: 'inherit',
                    overflow: 'auto',
                  }}
                />
                {query.length > 0 && (
                  <div style={{
                    position: 'absolute', right: 8, bottom: 8,
                    fontSize: 9, color: query.length > 3500 ? '#EF4444' : 'rgba(255,255,255,0.25)',
                  }}>
                    {query.length}/4000
                  </div>
                )}
              </div>
              <button
                className="cathy-send-btn"
                onClick={() => sendMessage(query)}
                disabled={!query.trim() || thinking || query.length > 4000}
              >
                {thinking ? '…' : '↑'}
              </button>
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', marginTop: 5, textAlign: 'center' }}>
              Ctrl+K to toggle · Shift+Enter for new line
            </div>
          </div>
        </div>
      )}
    </>
  )
}
