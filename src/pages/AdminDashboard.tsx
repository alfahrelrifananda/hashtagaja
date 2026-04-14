import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { ThemeToggle } from '../components/ThemeToggle'
import { content } from '../lib/content'
import { useTitle } from '../hooks/useTitle'
import type { Room, Message } from '../types'
import styles from './AdminDashboard.module.css'

const c = content.admin.dashboard

function formatDate(str: string) {
  return new Date(str).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
}
function formatExpiry(str: string) {
  const diff = new Date(str).getTime() - Date.now()
  if (diff < 0) return c.expired
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}
function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes}b`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}kb`
  return `${(bytes / (1024 * 1024)).toFixed(1)}mb`
}

interface OnlineRoom {
  roomId: string
  hashtag: string
  userCount: number
}

export function AdminDashboard() {
  const navigate = useNavigate()

  // Rooms
  const [rooms, setRooms] = useState<Room[]>([])
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null)
  const [loadingRooms, setLoadingRooms] = useState(true)
  const [search, setSearch] = useState('')

  // Multi-select rooms
  const [selectedRoomIds, setSelectedRoomIds] = useState<Set<string>>(new Set())
  const [multiSelectMode, setMultiSelectMode] = useState(false)

  // Messages
  const [messages, setMessages] = useState<Message[]>([])
  const [loadingMessages, setLoadingMessages] = useState(false)

  // Multi-select messages
  const [selectedMsgIds, setSelectedMsgIds] = useState<Set<string>>(new Set())

  // Online monitoring
  const [onlineRooms, setOnlineRooms] = useState<OnlineRoom[]>([])
  const [totalOnline, setTotalOnline] = useState(0)
  const [activeTab, setActiveTab] = useState<'rooms' | 'online'>('rooms')
  // UI state
  const [toast, setToast] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<{ type: 'room' | 'message' | 'rooms' | 'messages'; ids: string[]; label: string } | null>(null)
  const [deleting, setDeleting] = useState(false)

  useTitle(selectedRoom ? `#${selectedRoom.hashtag} — admin` : 'admin — hashtag')

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  const loadRooms = useCallback(async () => {
    setLoadingRooms(true)
    const { data, error } = await supabase.from('rooms').select('*').order('created_at', { ascending: false })
    if (!error) setRooms(data || [])
    setLoadingRooms(false)
  }, [])

  const loadMessages = useCallback(async (roomId: string) => {
    setLoadingMessages(true)
    const { data, error } = await supabase.from('messages').select('*').eq('room_id', roomId).order('created_at', { ascending: true })
    if (!error) setMessages(data || [])
    setLoadingMessages(false)
  }, [])

  // Realtime: listen for new/deleted rooms and new messages globally
  useEffect(() => {
    const channel = supabase.channel('admin-realtime')
      // New room created
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'rooms' },
        (payload) => {
          setRooms(prev => [payload.new as Room, ...prev])
          showToast(`ruangan baru: #${(payload.new as Room).hashtag}`)
        }
      )
      // Room deleted
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'rooms' },
        (payload) => {
          const deleted = payload.old as Room
          setRooms(prev => prev.filter(r => r.id !== deleted.id))
          setSelectedRoom(prev => prev?.id === deleted.id ? null : prev)
        }
      )
      // New message in selected room
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const msg = payload.new as Message
          setMessages(prev => {
            if (!prev.length) return prev // no room selected
            if (prev[0]?.room_id !== msg.room_id) return prev // different room
            if (prev.some(m => m.id === msg.id)) return prev // dedupe
            return [...prev, msg]
          })
        }
      )
      // Message deleted
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' },
        (payload) => {
          const deleted = payload.old as Message
          setMessages(prev => prev.filter(m => m.id !== deleted.id))
        }
      )
      .subscribe()

    return () => { channel.unsubscribe() }
  }, [])

  // Presence monitoring — subscribe to each room channel
  useEffect(() => {
    if (rooms.length === 0) return

    const presenceChannels = rooms.map(room => {
      const ch = supabase.channel(`room:${room.id}`)
      ch.on('presence', { event: 'sync' }, () => {
        const state = ch.presenceState()
        const count = Object.values(state).flat().length
        setOnlineRooms(prev => {
          const filtered = prev.filter(o => o.roomId !== room.id)
          if (count > 0) return [...filtered, { roomId: room.id, hashtag: room.hashtag, userCount: count }]
          return filtered
        })
        setTotalOnline(prev => {
          // recalculate from all rooms
          return prev // will be updated by setOnlineRooms
        })
      })
      ch.subscribe()
      return ch
    })

    return () => { presenceChannels.forEach(ch => ch.unsubscribe()) }
  }, [rooms])

  // Keep totalOnline in sync with onlineRooms
  useEffect(() => {
    setTotalOnline(onlineRooms.reduce((sum, r) => sum + r.userCount, 0))
  }, [onlineRooms])

  useEffect(() => { loadRooms() }, [loadRooms])
  useEffect(() => {
    if (selectedRoom) loadMessages(selectedRoom.id)
    else setMessages([])
    setSelectedMsgIds(new Set())
  }, [selectedRoom, loadMessages])

  // Reset multi-select when leaving mode
  useEffect(() => {
    if (!multiSelectMode) setSelectedRoomIds(new Set())
  }, [multiSelectMode])

  // --- Delete single room ---
  async function deleteRoomById(id: string) {
    const { data: files } = await supabase.storage.from('room-files').list(id)
    if (files && files.length > 0) {
      await supabase.storage.from('room-files').remove(files.map(f => `${id}/${f.name}`))
    }
    await supabase.from('rooms').delete().eq('id', id)
    setRooms(prev => prev.filter(r => r.id !== id))
    if (selectedRoom?.id === id) setSelectedRoom(null)
  }

  // --- Delete multiple rooms ---
  async function deleteSelectedRooms(ids: string[]) {
    setDeleting(true)
    try {
      for (const id of ids) await deleteRoomById(id)
      showToast(`${ids.length} ruangan dihapus`)
      setSelectedRoomIds(new Set())
      setMultiSelectMode(false)
    } catch { showToast(c.toast.roomError) }
    finally { setDeleting(false); setConfirmDelete(null) }
  }

  // --- Delete single message ---
  async function deleteMessageById(id: string) {
    await supabase.from('messages').delete().eq('id', id)
    setMessages(prev => prev.filter(m => m.id !== id))
  }

  // --- Delete multiple messages ---
  async function deleteSelectedMessages(ids: string[]) {
    setDeleting(true)
    try {
      for (const id of ids) await deleteMessageById(id)
      showToast(`${ids.length} pesan dihapus`)
      setSelectedMsgIds(new Set())
    } catch { showToast(c.toast.messageError) }
    finally { setDeleting(false); setConfirmDelete(null) }
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    navigate('/admin')
  }

  function toggleRoomSelect(id: string) {
    setSelectedRoomIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleMsgSelect(id: string) {
    setSelectedMsgIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function selectAllMessages() {
    setSelectedMsgIds(new Set(messages.map(m => m.id)))
  }

  function selectAllRooms() {
    setSelectedRoomIds(new Set(filteredRooms.map(r => r.id)))
  }

  const filteredRooms = rooms.filter(r => r.hashtag.toLowerCase().includes(search.toLowerCase()))
  const fileMessages = messages.filter(m => m.type === 'file')
  const textMessages = messages.filter(m => m.type === 'text')

  return (
    <div className={styles.dashboard}>

      {/* ── Sidebar ── */}
      <aside className={styles['dashboard-sidebar']}>
        <div className={styles['sidebar-header']}>
          <span className={styles['sidebar-logo']}>{content.logo}</span>
          <span className={styles['sidebar-title']}>{c.title}</span>
          <ThemeToggle />
        </div>

        {/* Tabs */}
        <div className={styles['sidebar-tabs']}>
          <button
            className={`${styles['sidebar-tab']} ${activeTab === 'rooms' ? styles.active : ''}`}
            onClick={() => setActiveTab('rooms')}
          >ruangan</button>
          <button
            className={`${styles['sidebar-tab']} ${activeTab === 'online' ? styles.active : ''}`}
            onClick={() => setActiveTab('online')}
          >online <span className={styles['online-badge']}>{totalOnline}</span></button>
        </div>

        {activeTab === 'rooms' && (
          <>
            <div className={styles['sidebar-search']}>
              <input
                className={styles['sidebar-search-input']}
                type="text"
                placeholder={c.searchPlaceholder}
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>

            <div className={styles['sidebar-stats']}>
              <div className={styles.stat}>
                <span className={styles['stat-value']}>{rooms.length}</span>
                <span className={styles['stat-label']}>{c.stats.rooms}</span>
              </div>
              <div className={styles.stat}>
                <span className={styles['stat-value']}>{rooms.filter(r => new Date(r.expires_at) > new Date()).length}</span>
                <span className={styles['stat-label']}>{c.stats.active}</span>
              </div>
              <div className={styles.stat}>
                <span className={styles['stat-value']}>{rooms.filter(r => new Date(r.expires_at) <= new Date()).length}</span>
                <span className={styles['stat-label']}>{c.stats.expired}</span>
              </div>
            </div>

            {/* Multi-select toolbar */}
            <div className={styles['sidebar-toolbar']}>
              <button
                className={`${styles['toolbar-btn']} ${multiSelectMode ? styles.active : ''}`}
                onClick={() => setMultiSelectMode(p => !p)}
              >{multiSelectMode ? 'batal' : 'pilih'}</button>
              {multiSelectMode && (
                <>
                  <button className={styles['toolbar-btn']} onClick={selectAllRooms}>semua</button>
                  {selectedRoomIds.size > 0 && (
                    <button
                      className={`${styles['toolbar-btn']} ${styles.danger}`}
                      onClick={() => setConfirmDelete({ type: 'rooms', ids: [...selectedRoomIds], label: `${selectedRoomIds.size} ruangan` })}
                    >hapus {selectedRoomIds.size}</button>
                  )}
                </>
              )}
              <button
                className={`${styles['toolbar-btn']} ${styles.danger} ${styles['ml-auto']}`}
                onClick={() => setConfirmDelete({ type: 'rooms', ids: rooms.map(r => r.id), label: 'semua ruangan' })}
              >hapus semua</button>
            </div>

            <div className={styles['sidebar-rooms']}>
              {loadingRooms ? (
                <p className={styles['sidebar-loading']}>{c.sidebarLoading}</p>
              ) : filteredRooms.length === 0 ? (
                <p className={styles['sidebar-empty']}>{c.sidebarEmpty}</p>
              ) : filteredRooms.map(room => {
                const expired = new Date(room.expires_at) <= new Date()
                const isSelected = selectedRoomIds.has(room.id)
                return (
                  <div
                    key={room.id}
                    className={`${styles['room-item']} ${selectedRoom?.id === room.id ? styles.active : ''} ${expired ? styles.expired : ''} ${isSelected ? styles.selected : ''}`}
                    onClick={() => multiSelectMode ? toggleRoomSelect(room.id) : setSelectedRoom(room)}
                  >
                    {multiSelectMode && (
                      <span className={`${styles.checkbox} ${isSelected ? styles.checked : ''}`}>
                        {isSelected ? '✓' : ''}
                      </span>
                    )}
                    <span className={styles['room-item-tag']}>#{room.hashtag}</span>
                    <span className={styles['room-item-meta']}>{expired ? c.expired : formatExpiry(room.expires_at)}</span>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {activeTab === 'online' && (
          <div className={styles['online-panel']}>
            <div className={styles['online-summary']}>
              <span className={styles['online-total']}>{totalOnline}</span>
              <span className={styles['online-label']}>pengguna online</span>
            </div>
            {onlineRooms.length === 0 ? (
              <p className={styles['sidebar-empty']}>tidak ada yang online</p>
            ) : onlineRooms.map(or => (
              <div key={or.roomId} className={styles['online-room-item']} onClick={() => {
                const r = rooms.find(x => x.id === or.roomId)
                if (r) { setSelectedRoom(r); setActiveTab('rooms') }
              }}>
                <span className={styles['online-room-dot']} />
                <span className={styles['online-room-tag']}>#{or.hashtag}</span>
                <span className={styles['online-room-count']}>{or.userCount} online</span>
              </div>
            ))}
          </div>
        )}

        <div className={styles['sidebar-footer']}>
          <button className={styles['signout-btn']} onClick={handleSignOut}>{c.signOut}</button>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className={styles['dashboard-main']}>
        {!selectedRoom ? (
          <div className={styles['dashboard-empty']}>
            <p className={styles['dashboard-empty-text']}>{c.mainEmpty}</p>
          </div>
        ) : (
          <div className={`${styles['room-detail']} fade-in`}>
            <div className={styles['room-detail-header']}>
              <div className={styles['room-detail-info']}>
                <h2 className={styles['room-detail-tag']}>#{selectedRoom.hashtag}</h2>
                <div className={styles['room-detail-meta']}>
                  <span>{c.room.created} {formatDate(selectedRoom.created_at)}</span>
                  <span className={styles['meta-sep']}>/</span>
                  <span>{new Date(selectedRoom.expires_at) <= new Date() ? c.expired : `${c.room.expiresIn} ${formatExpiry(selectedRoom.expires_at)}`}</span>
                  <span className={styles['meta-sep']}>/</span>
                  <span>{messages.length} {c.room.messages}</span>
                </div>
              </div>
              <button
                className={styles['delete-room-btn']}
                onClick={() => setConfirmDelete({ type: 'room', ids: [selectedRoom.id], label: `#${selectedRoom.hashtag}` })}
              >{c.room.deleteBtn}</button>
            </div>

            <div className={styles['room-detail-body']}>

              {/* Messages section */}
              <section className={styles['detail-section']}>
                <div className={styles['detail-section-header']}>
                  <h3 className={styles['detail-section-title']}>
                    {c.sections.messages}
                    <span className={styles['detail-count']}>{textMessages.length}</span>
                  </h3>
                  <div className={styles['detail-actions']}>
                    {selectedMsgIds.size > 0 && (
                      <button
                        className={`${styles['detail-action-btn']} ${styles.danger}`}
                        onClick={() => setConfirmDelete({ type: 'messages', ids: [...selectedMsgIds].filter(id => messages.find(m => m.id === id)?.type === 'text'), label: `${selectedMsgIds.size} pesan` })}
                      >hapus {selectedMsgIds.size}</button>
                    )}
                    {textMessages.length > 0 && (
                      <button className={styles['detail-action-btn']} onClick={selectAllMessages}>pilih semua</button>
                    )}
                  </div>
                </div>
                {loadingMessages ? (
                  <p className={styles['detail-loading']}>{c.mainLoading}</p>
                ) : textMessages.length === 0 ? (
                  <p className={styles['detail-empty']}>{c.sections.noMessages}</p>
                ) : (
                  <div className={styles['messages-list']}>
                    {textMessages.map(msg => {
                      const isSelected = selectedMsgIds.has(msg.id)
                      return (
                        <div
                          key={msg.id}
                          className={`${styles['msg-row-admin']} ${isSelected ? styles.selected : ''}`}
                          onClick={() => toggleMsgSelect(msg.id)}
                        >
                          <span className={`${styles.checkbox} ${isSelected ? styles.checked : ''}`}>{isSelected ? '✓' : ''}</span>
                          <div className={styles['msg-admin-meta']}>
                            <span className={styles['msg-admin-sender']}>{msg.sender_name}</span>
                            <span className={styles['msg-admin-time']}>{formatDate(msg.created_at)}</span>
                          </div>
                          <div className={styles['msg-admin-content']}>{msg.content}</div>
                          <button
                            className={styles['msg-delete-btn']}
                            onClick={e => { e.stopPropagation(); setConfirmDelete({ type: 'message', ids: [msg.id], label: msg.content.slice(0, 40) }) }}
                          >×</button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>

              {/* Files section */}
              <section className={styles['detail-section']}>
                <div className={styles['detail-section-header']}>
                  <h3 className={styles['detail-section-title']}>
                    {c.sections.files}
                    <span className={styles['detail-count']}>{fileMessages.length}</span>
                  </h3>
                </div>
                {loadingMessages ? (
                  <p className={styles['detail-loading']}>{c.mainLoading}</p>
                ) : fileMessages.length === 0 ? (
                  <p className={styles['detail-empty']}>{c.sections.noFiles}</p>
                ) : (
                  <div className={styles['files-list']}>
                    {fileMessages.map(msg => (
                      <div key={msg.id} className={styles['file-row-admin']}>
                        <div className={styles['file-admin-info']}>
                          <a href={msg.file_url} target="_blank" rel="noopener noreferrer" className={styles['file-admin-name']}>
                            {msg.file_name}
                          </a>
                          <span className={styles['file-admin-meta']}>
                            {msg.file_size ? formatSize(msg.file_size) : ''}
                            <span className={styles['meta-sep']}>/</span>
                            {msg.sender_name}
                            <span className={styles['meta-sep']}>/</span>
                            {formatDate(msg.created_at)}
                          </span>
                        </div>
                        <button
                          className={styles['msg-delete-btn']}
                          onClick={() => setConfirmDelete({ type: 'message', ids: [msg.id], label: msg.file_name || 'file' })}
                        >×</button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </div>
        )}
      </main>

      {/* Confirm dialog */}
      {confirmDelete && (
        <div className={`${styles['confirm-overlay']} fade-in`} onClick={() => !deleting && setConfirmDelete(null)}>
          <div className={styles['confirm-box']} onClick={e => e.stopPropagation()}>
            <p className={styles['confirm-title']}>hapus {confirmDelete.label}?</p>
            <p className={styles['confirm-desc']}>{c.confirm.desc}</p>
            <div className={styles['confirm-actions']}>
              <button className={styles['confirm-cancel']} onClick={() => setConfirmDelete(null)} disabled={deleting}>{c.confirm.cancel}</button>
              <button
                className={styles['confirm-delete']}
                disabled={deleting}
                onClick={() => {
                  if (confirmDelete.type === 'room') deleteSelectedRooms(confirmDelete.ids)
                  else if (confirmDelete.type === 'rooms') deleteSelectedRooms(confirmDelete.ids)
                  else deleteSelectedMessages(confirmDelete.ids)
                }}
              >{deleting ? '...' : c.confirm.delete}</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={`${styles['admin-toast']} fade-in`}>{toast}</div>}
    </div>
  )
}