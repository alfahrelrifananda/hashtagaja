import { useState, useRef, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useSession } from '../hooks/useSession'
import { useSettings } from '../hooks/useSettings'
import { ThemeToggle } from '../components/ThemeToggle'
import { SettingsModal } from '../components/SettingsModal'
import { useTitle } from '../hooks/useTitle'
import { getContent } from '../lib/content'
import type { Message, Room as RoomType } from '../types'
import styles from './Room.module.css'

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}
function formatExpiry(dateStr: string) {
  const diff = new Date(dateStr).getTime() - Date.now()
  if (diff <= 0) return null // expired
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  const s = Math.floor((diff % 60000) / 1000)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}
function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes}b`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}kb`
  return `${(bytes / (1024 * 1024)).toFixed(1)}mb`
}
function renderMessageContent(text: string) {
  const urlRegex = /(https?:\/\/[^\s]+)/g
  const parts = text.split(urlRegex)
  return parts.map((part, i) =>
    urlRegex.test(part)
      ? <a key={i} href={part} target="_blank" rel="noopener noreferrer" className={styles['msg-link']}>{part}</a>
      : <span key={i}>{part}</span>
  )
}

export function Room() {
  const { hashtag } = useParams<{ hashtag: string }>()
  const { settings } = useSettings()
  const c = getContent(settings.language).room

  useTitle(hashtag ? `#${hashtag} — hashtagaja` : 'hashtagaja')
  const navigate = useNavigate()

  useEffect(() => {
    if (!hashtag || !hashtag.trim() || !/^[a-z0-9_-]+$/i.test(hashtag)) {
      navigate('/', { replace: true })
    }
  }, [hashtag, navigate])

  const { userId, userName } = useSession()
  const [room, setRoom] = useState<RoomType | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [timeLeft, setTimeLeft] = useState<string | null>(null)
  const [memberCount, setMemberCount] = useState(1)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [confirmBack, setConfirmBack] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [fileSizeWarning, setFileSizeWarning] = useState<File | null>(null)
  const [isCreator, setIsCreator] = useState(false)
  const [roomDeleted, setRoomDeleted] = useState(false)
  const [roomExpired, setRoomExpired] = useState(false)
  const [confirmDeleteRoom, setConfirmDeleteRoom] = useState(false)
  const [deletingRoom, setDeletingRoom] = useState(false)

  // ── Edit & Delete state ──
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    function handleGlobalKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === '/') { e.preventDefault(); textareaRef.current?.focus() }
    }
    window.addEventListener('keydown', handleGlobalKey)
    return () => window.removeEventListener('keydown', handleGlobalKey)
  }, [])

  useEffect(() => { if (!hashtag) return; initRoom() }, [hashtag])

  useEffect(() => {
    if (!room) return
    const tick = () => {
      const t = formatExpiry(room.expires_at)
      setTimeLeft(t)
      if (!t) setRoomExpired(true)
    }
    tick(); const id = setInterval(tick, 1000); return () => clearInterval(id)
  }, [room])

  useEffect(() => {
    if (!room) return

    const channel = supabase.channel(`room:${room.id}`)
      // New messages
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
        filter: `room_id=eq.${room.id}`
      }, (payload) => {
        setMessages(prev => [...prev, payload.new as Message])
        setTimeout(scrollToBottom, 50)
      })
      // Message updated (edit)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'messages',
        filter: `room_id=eq.${room.id}`
      }, (payload) => {
        setMessages(prev => prev.map(m =>
          m.id === payload.new.id ? { ...m, ...payload.new as Message } : m
        ))
      })
      // Message deleted
      .on('postgres_changes', {
        event: 'DELETE', schema: 'public', table: 'messages',
        filter: `room_id=eq.${room.id}`
      }, (payload) => {
        setMessages(prev => prev.filter(m => m.id !== payload.old.id))
      })
      // Room deleted — redirect guests
      .on('postgres_changes', {
        event: 'DELETE', schema: 'public', table: 'rooms'
      }, () => {
        setRoomDeleted(true)
      })
      // Presence — track online members
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<{ user_id: string }>()
        const onlineUsers = Object.values(state).flat().map(p => p.user_id)
        setMemberCount(onlineUsers.length)
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ user_id: userId, online_at: new Date().toISOString() })
        }
      })

    channelRef.current = channel
    return () => { channel.unsubscribe() }
  }, [room, userId, scrollToBottom])

  useEffect(() => { scrollToBottom() }, [messages, scrollToBottom])
  useEffect(() => {
    if (!loading && room) setTimeout(() => textareaRef.current?.focus(), 100)
  }, [loading, room])

  // Auto-redirect when room is deleted
  useEffect(() => {
    if (!roomDeleted) return
    const t = setTimeout(() => navigate('/'), 3000)
    return () => clearTimeout(t)
  }, [roomDeleted, navigate])

  // When room expires, owner's browser deletes it (triggers realtime DELETE for guests)
  useEffect(() => {
    if (!roomExpired || !isCreator || !room) return
    async function cleanup() {
      const { data: files } = await supabase.storage.from('room-files').list(room!.id)
      if (files && files.length > 0) {
        const paths = files.map(f => `${room!.id}/${f.name}`)
        await supabase.storage.from('room-files').remove(paths)
      }
      await supabase.from('rooms').delete().eq('id', room!.id)
    }
    cleanup()
  }, [roomExpired, isCreator, room])

  async function initRoom() {
    setLoading(true)
    try {
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

      const { data: existingRoom } = await supabase
        .from('rooms')
        .select('*')
        .eq('hashtag', hashtag)
        .gt('expires_at', new Date().toISOString())
        .single()

      if (!existingRoom) {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
        const { count } = await supabase
          .from('rooms')
          .select('*', { count: 'exact', head: true })
          .eq('creator_id', userId)
          .gte('created_at', oneHourAgo)

        if (count !== null && count >= 3) {
          setError(c.errors.roomLimitReached)
          setLoading(false)
          return
        }

        const { error: upsertError } = await supabase
          .from('rooms')
          .upsert(
            { hashtag, expires_at: expiresAt, creator_id: userId },
            { onConflict: 'hashtag', ignoreDuplicates: true }
          )
        if (upsertError) throw upsertError
      } else if (!existingRoom.creator_id) {
        await supabase
          .from('rooms')
          .update({ creator_id: userId })
          .eq('id', existingRoom.id)
      }

      const { data: fetchedRoom, error: fetchError } = await supabase
        .from('rooms')
        .select('*')
        .eq('hashtag', hashtag)
        .gt('expires_at', new Date().toISOString())
        .single()

      if (fetchError) throw fetchError
      if (!fetchedRoom) throw new Error('room not found')

      setRoom(fetchedRoom)
      setIsCreator(fetchedRoom.creator_id === userId)

      const { data: msgs } = await supabase
        .from('messages')
        .select('*')
        .eq('room_id', fetchedRoom.id)
        .order('created_at', { ascending: true })

      setMessages(msgs || [])
    } catch (err) { setError(c.errors.loadFailed); console.error(err) }
    finally { setLoading(false) }
  }

  async function sendMessage() {
    if (!input.trim() || !room || sending) return
    setSending(true)
    const text = input.trim()
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    try {
      const { error } = await supabase
        .from('messages')
        .insert({ room_id: room.id, content: text, sender_id: userId, sender_name: userName, type: 'text' })
      if (error) throw error
    } catch (err) { setError(c.errors.sendFailed); setInput(text); console.error(err) }
    finally { setSending(false); setTimeout(() => textareaRef.current?.focus(), 0) }
  }

  // ── Edit handlers ──
  function startEdit(msg: Message) {
    setEditingId(msg.id)
    setEditText(msg.content)
    setDeletingId(null)
  }

  async function saveEdit(msgId: string) {
    const text = editText.trim()
    if (!text) return
    try {
      const { error } = await supabase
        .from('messages')
        .update({ content: text, edited_at: new Date().toISOString() })
        .eq('id', msgId)
        .eq('sender_id', userId)
      if (error) throw error
      setMessages(prev => prev.map(m =>
        m.id === msgId ? { ...m, content: text, edited_at: new Date().toISOString() } : m
      ))
    } catch (err) {
      setError(c.errors.sendFailed)
      console.error(err)
    } finally {
      setEditingId(null)
      setEditText('')
    }
  }

  // ── Delete handler ──
  async function deleteMessage(msgId: string) {
    try {
      const { error } = await supabase
        .from('messages')
        .delete()
        .eq('id', msgId)
        .eq('sender_id', userId)
      if (error) throw error
      setMessages(prev => prev.filter(m => m.id !== msgId))
    } catch (err) {
      setError(c.errors.sendFailed)
      console.error(err)
    } finally {
      setDeletingId(null)
    }
  }

  async function uploadFile(file: File) {
    if (!room) return
    if (file.size > 50 * 1024 * 1024) { setError(c.errors.fileTooLarge); return }

    const { count } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('room_id', room.id)
      .eq('type', 'file')

    if (count !== null && count >= 20) {
      setError(c.errors.fileLimitReached)
      return
    }

    setUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `${room.id}/${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage.from('room-files').upload(path, file)
      if (uploadError) throw uploadError
      const { data: { publicUrl } } = supabase.storage.from('room-files').getPublicUrl(path)
      const { error: msgError } = await supabase
        .from('messages')
        .insert({ room_id: room.id, content: file.name, sender_id: userId, sender_name: userName, type: 'file', file_url: publicUrl, file_name: file.name, file_size: file.size })
      if (msgError) throw msgError
    } catch (err) { setError(c.errors.uploadFailed); console.error(err) }
    finally { setUploading(false) }
  }

  function handleFileSelected(file: File) {
    if (file.size > 10 * 1024 * 1024) {
      setFileSizeWarning(file)
      return
    }
    uploadFile(file)
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFileSelected(file)
    e.target.value = ''
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  function handleTextareaChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
  }

  function copyMessage(id: string, text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 1500)
    })
  }

  function handleDragOver(e: React.DragEvent) { e.preventDefault(); setIsDragging(true) }
  function handleDragLeave(e: React.DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false)
  }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFileSelected(file)
  }

  async function deleteRoom() {
    if (!room) return
    setDeletingRoom(true)
    try {
      const { data: files } = await supabase.storage.from('room-files').list(room.id)
      if (files && files.length > 0) {
        const paths = files.map(f => `${room.id}/${f.name}`)
        await supabase.storage.from('room-files').remove(paths)
      }
      await supabase.from('rooms').delete().eq('id', room.id)
      navigate('/')
    } catch (err) {
      setError(c.errors.loadFailed)
      console.error(err)
    } finally {
      setDeletingRoom(false)
      setConfirmDeleteRoom(false)
    }
  }

  if (loading) return (
    <div className={styles['room-loading']}>
      <span className={styles['loading-text']}>{c.loading} <span className={styles['loading-tag']}>#{hashtag}</span><span className={styles['loading-cursor']}>{c.loadingCursor}</span></span>
    </div>
  )
  if (error && !room) return (
    <div className={styles['room-loading']}>
      <span className={`${styles['loading-text']} ${styles['error-text']}`}>{error}</span>
      <button className={styles['retry-btn']} onClick={() => navigate('/')}>{c.backFromError}</button>
    </div>
  )

  const grouped = messages.reduce<{ date: string; msgs: Message[] }[]>((acc, msg) => {
    const date = new Date(msg.created_at).toLocaleDateString()
    const last = acc[acc.length - 1]
    if (last?.date === date) { last.msgs.push(msg) } else { acc.push({ date, msgs: [msg] }) }
    return acc
  }, [])

  return (
    <div className={styles['room-layout']}>
    <aside className={styles['ad-sidebar']}>
      <img src="https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExNGE3eGprODFiY3pia2ZvOTAycG9qMjE3a2JsdDgydWU4NTYxczBlaCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/jPXB66UWvUiqHNwPlD/giphy.gif" alt="" />
    </aside>
    <div
      className={`${styles.room} ${isDragging ? styles.dragging : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className={styles['drag-overlay']}>
          <span className={styles['drag-label']}>{c.dragLabel}</span>
        </div>
      )}

      {/* Room deleted dialog */}
      {roomDeleted && (
        <div className={`${styles['confirm-overlay']} fade-in`}>
          <div className={styles['confirm-box']} onClick={e => e.stopPropagation()}>
            <p className={styles['confirm-title']}>{c.roomDeletedTitle}</p>
            <p className={styles['confirm-desc']}>{c.roomDeletedDesc}</p>
            <div className={styles['confirm-actions']}>
              <button className={styles['confirm-leave']} onClick={() => navigate('/')}>{c.roomDeletedBtn}</button>
            </div>
          </div>
        </div>
      )}

      <header className={styles['room-header']}>
        <div className={styles['room-header-left']}>
          <button className={styles['back-btn']} onClick={() => isCreator ? setConfirmDeleteRoom(true) : setConfirmBack(true)} title={isCreator ? c.deleteRoomTitle : c.backTitle}>{c.backBtn}</button>
          <div className={styles['room-info']}>
            <h1 className={styles['room-hashtag']}>#{hashtag}</h1>
            <div className={styles['room-meta']}>
              <span className={styles['meta-item']}><span className={`${styles['meta-dot']} ${styles.online}`} />{memberCount} {c.online}</span>
              <span className={styles['meta-sep']}>/</span>
              <span className={`${styles['meta-item']} ${!timeLeft ? styles['meta-expired'] : ''}`}>
                {timeLeft ? `${c.expiresIn} ${timeLeft}` : c.expired}
              </span>
              <span className={styles['meta-sep']}>/</span>
              <span className={`${styles['meta-item']} ${styles['meta-you']}`}>{c.youLabel}: {userName}</span>
              <span className={styles['meta-sep']}>/</span>
              <span className={`${styles['meta-badge']} ${isCreator ? styles['badge-owner'] : styles['badge-guest']}`}>
                {isCreator ? c.badgeOwner : (room?.creator_id ? c.badgeGuest : c.badgeNoOwner)}
              </span>
            </div>
          </div>
        </div>
        <div className={styles['room-header-right']}>
          {room?.creator_id === userId && (
            <button className={styles['delete-room-btn']} onClick={() => setConfirmDeleteRoom(true)}>
              {c.deleteRoomBtn}
            </button>
          )}
          <button className="settings-btn" onClick={() => setShowSettings(true)}>{c.settingsBtn}</button>
          <ThemeToggle />
        </div>
      </header>

      <main className={styles['room-messages']}>
        {messages.length === 0 ? (
          <div className={`${styles['room-empty']} fade-in`}>
            <p className={styles['empty-title']}>#{hashtag}</p>
            <p className={styles['empty-desc']}>{c.emptyDesc}</p>
          </div>
        ) : grouped.map(group => (
          <div key={group.date} className={styles['message-group']}>
            <div className={styles['date-divider']}>
              <span>{group.date === new Date().toLocaleDateString() ? c.today : group.date}</span>
            </div>
            {group.msgs.map((msg, i) => {
              const isSelf = msg.sender_id === userId
              const prevMsg = group.msgs[i - 1]
              const showSender = !prevMsg || prevMsg.sender_id !== msg.sender_id
              return (
                <div key={msg.id} className={`${styles.message} ${isSelf ? styles.self : styles.other} ${showSender ? styles['show-sender'] : ''} fade-in`}>
                  {showSender && (
                    <span className={`${styles['msg-sender']} ${isSelf ? styles['msg-sender-self'] : ''}`}>
                      {isSelf ? `${msg.sender_name} (${c.youLabel})` : msg.sender_name}
                    </span>
                  )}
                  <div className={styles['msg-row']}>
                    {msg.type === 'file' ? (
                      <a href={msg.file_url} target="_blank" rel="noopener noreferrer" className={`${styles['msg-bubble']} ${styles['file-bubble']} ${isSelf ? styles.self : styles.other}`}>
                        <span className={styles['file-icon']}>{c.fileIcon}</span>
                        <span className={styles['file-info']}>
                          <span className={styles['file-name']}>{msg.file_name}</span>
                          {msg.file_size && <span className={styles['file-size']}>{formatFileSize(msg.file_size)}</span>}
                        </span>
                        <div className={styles['file-bubble-right']}>
                          <span className={styles['msg-time-inline']}>{formatTime(msg.created_at)}</span>
                        </div>
                      </a>
                    ) : editingId === msg.id ? (
                      /* ── Mode Edit ── */
                      <div className={styles['edit-wrap']}>
                        <textarea
                          className={styles['edit-textarea']}
                          value={editText}
                          onChange={e => setEditText(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(msg.id) }
                            if (e.key === 'Escape') { setEditingId(null) }
                          }}
                          autoFocus
                        />
                        <div className={styles['edit-actions']}>
                          <button className={styles['edit-cancel-btn']} onClick={() => setEditingId(null)}>Batal</button>
                          <button className={styles['edit-save-btn']} onClick={() => saveEdit(msg.id)}>Simpan</button>
                        </div>
                      </div>
                    ) : (
                      /* ── Bubble Normal ── */
                      <div className={`${styles['msg-bubble-wrap']} ${isSelf ? styles.self : styles.other}`}>
                        <div className={`${styles['msg-bubble']} ${styles['text-bubble']} ${isSelf ? styles.self : styles.other}`}>
                          {renderMessageContent(msg.content)}
                          {(msg as any).edited_at && (
                            <span className={styles['edited-label']}>diedit</span>
                          )}
                          <span className={styles['msg-time-inline']}>{formatTime(msg.created_at)}</span>
                        </div>

                        {/* Tombol aksi — hanya untuk pesan sendiri */}
                        {isSelf ? (
                          <div className={styles['msg-actions']}>
                            <button
                              className={styles['copy-btn']}
                              onClick={() => copyMessage(msg.id, msg.content)}
                              title={c.copyBtn}
                            >
                              {copiedId === msg.id ? c.copiedBtn : c.copyBtn}
                            </button>
                            <button
                              className={styles['action-edit-btn']}
                              onClick={() => startEdit(msg)}
                            >
                              Edit
                            </button>
                            {deletingId === msg.id ? (
                              <>
                                <span className={styles['delete-confirm-label']}>Hapus?</span>
                                <button className={styles['action-delete-confirm-btn']} onClick={() => deleteMessage(msg.id)}>Ya</button>
                                <button className={styles['action-cancel-btn']} onClick={() => setDeletingId(null)}>Tidak</button>
                              </>
                            ) : (
                              <button className={styles['action-delete-btn']} onClick={() => setDeletingId(msg.id)}>Hapus</button>
                            )}
                          </div>
                        ) : (
                          /* Tombol salin saja untuk pesan orang lain */
                          <button
                            className={styles['copy-btn']}
                            onClick={() => copyMessage(msg.id, msg.content)}
                            title={c.copyBtn}
                          >
                            {copiedId === msg.id ? c.copiedBtn : c.copyBtn}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </main>

      {error && <div className={`${styles['error-toast']} fade-in`} onClick={() => setError('')}>{error} ×</div>}
      {uploading && <div className={styles['upload-bar']}><div className={styles['upload-bar-inner']} /></div>}

      <footer className={styles['room-footer']}>
        <div className={styles['room-input-wrap']}>
          <input ref={fileInputRef} type="file" className={styles['file-input-hidden']} onChange={handleFileInputChange} />
          <button className={styles['attach-btn']} onClick={() => fileInputRef.current?.click()} disabled={uploading} title={c.attachTitle}>
            {uploading ? '…' : c.attachIdle}
          </button>
          <textarea
            ref={textareaRef}
            className={styles['room-textarea']}
            value={input}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            placeholder={c.inputPlaceholder}
            rows={1}
            disabled={sending}
          />
          <button className={styles['send-btn']} onClick={sendMessage} disabled={!input.trim() || sending} title={c.sendTitle}>
            {sending ? '…' : c.sendIdle}
          </button>
        </div>
        <p className={styles['room-input-hint']}>{c.inputHint}</p>
      </footer>

      {/* Settings modal */}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}

      {/* Confirm leave — guests only */}
      {confirmBack && room?.creator_id !== userId && (
        <div className={`${styles['confirm-overlay']} fade-in`} onClick={() => setConfirmBack(false)}>
          <div className={styles['confirm-box']} onClick={e => e.stopPropagation()}>
            <p className={styles['confirm-title']}>{c.leaveTitle}</p>
            <p className={styles['confirm-desc']}>{c.leaveDesc}</p>
            <div className={styles['confirm-actions']}>
              <button className={styles['confirm-cancel']} onClick={() => setConfirmBack(false)}>{c.leaveCancel}</button>
              <button className={styles['confirm-leave']} onClick={() => navigate('/')}>{c.leaveConfirm}</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm delete room */}
      {confirmDeleteRoom && (
        <div className={`${styles['confirm-overlay']} fade-in`} onClick={() => setConfirmDeleteRoom(false)}>
          <div className={styles['confirm-box']} onClick={e => e.stopPropagation()}>
            <p className={styles['confirm-title']}>{c.deleteRoomTitle}</p>
            <p className={styles['confirm-desc']}>{c.deleteRoomDesc}</p>
            <div className={styles['confirm-actions']}>
              <button className={styles['confirm-cancel']} onClick={() => setConfirmDeleteRoom(false)}>{c.deleteRoomCancel}</button>
              <button className={styles['confirm-delete']} onClick={deleteRoom} disabled={deletingRoom}>
                {deletingRoom ? '...' : c.deleteRoomConfirm}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Room deleted dialog — shown to guests */}
      {roomDeleted && !isCreator && (
        <div className={`${styles['confirm-overlay']} fade-in`}>
          <div className={styles['confirm-box']} onClick={e => e.stopPropagation()}>
            <p className={styles['confirm-title']}>{c.roomDeletedTitle}</p>
            <p className={styles['confirm-desc']}>{c.roomDeletedDesc}</p>
            <div className={styles['confirm-actions']}>
              <button className={styles['confirm-leave']} onClick={() => navigate('/')}>{c.roomDeletedBtn}</button>
            </div>
          </div>
        </div>
      )}

      {/* Room expired dialog */}
      {roomExpired && (
        <div className={`${styles['confirm-overlay']} fade-in`}>
          <div className={styles['confirm-box']} onClick={e => e.stopPropagation()}>
            <p className={styles['confirm-title']}>{c.roomExpiredTitle}</p>
            <p className={styles['confirm-desc']}>{c.roomExpiredDesc}</p>
            <div className={styles['confirm-actions']}>
              <button className={styles['confirm-leave']} onClick={() => navigate('/')}>{c.roomExpiredBtn}</button>
            </div>
          </div>
        </div>
      )}

      {/* File size warning >10mb */}
      {fileSizeWarning && (
        <div className={`${styles['confirm-overlay']} fade-in`} onClick={() => setFileSizeWarning(null)}>
          <div className={styles['confirm-box']} onClick={e => e.stopPropagation()}>
            <p className={styles['confirm-title']}>{fileSizeWarning.name}</p>
            <p className={styles['confirm-desc']}>{c.fileSizeWarning}</p>
            <div className={styles['confirm-actions']}>
              <button className={styles['confirm-cancel']} onClick={() => setFileSizeWarning(null)}>{c.fileSizeWarningCancel}</button>
              <button className={styles['confirm-leave']} onClick={() => { uploadFile(fileSizeWarning); setFileSizeWarning(null) }}>{c.fileSizeWarningConfirm}</button>
            </div>
          </div>
        </div>
      )}
    </div>
    <aside className={styles['ad-sidebar']}>
      <img src="https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExdnh4eGlrMXphZGRhcDhoNXVxMTdyeGpuYjZ6cmhodHZ2dWJ3eThhZSZlcD12MV9naWZzX3NlYXJjaCZjdD1n/Fr5LA2RCQbnVp74CxH/giphy.gif" alt="" />
    </aside>
    </div>
  )
}