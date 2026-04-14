export interface Room {
  id: string
  hashtag: string
  creator_id: string
  created_at: string
  expires_at: string
}

export interface Message {
  id: string
  room_id: string
  content: string
  sender_id: string
  sender_name: string
  type: 'text' | 'file'
  file_url?: string
  file_name?: string
  file_size?: number
  created_at: string
}