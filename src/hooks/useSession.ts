import { useState } from 'react'

const ADJECTIVES = [
  'sleepy', 'clumsy', 'grumpy', 'wobbly', 'soggy', 'fluffy', 'hangry',
  'goofy', 'spooky', 'crusty', 'wiggly', 'sassy', 'dizzy', 'chunky',
  'sneezy', 'dramatic', 'suspicious', 'confused', 'chaotic', 'sneaky',
]
const NOUNS = [
  'potato', 'burrito', 'noodle', 'goblin', 'pickle', 'nugget', 'waffle',
  'gremlin', 'meatball', 'biscuit', 'hamster', 'noodle', 'donut', 'raccoon',
  'cucumber', 'penguin', 'toaster', 'cabbage', 'platypus', 'avocado',
]

function generateName(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)]
  const num = Math.floor(Math.random() * 99) + 1
  return `${adj}_${noun}_${num}`
}

function generateId(): string {
  // crypto.randomUUID only works on HTTPS, fallback for HTTP
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

export function useSession() {
  const [userId] = useState<string>(() => {
    const stored = localStorage.getItem('hashtag-uid')
    if (stored) return stored
    const id = generateId()
    localStorage.setItem('hashtag-uid', id)
    return id
  })

  const [userName] = useState<string>(() => {
    const stored = localStorage.getItem('hashtag-uname')
    if (stored) return stored
    const name = generateName()
    localStorage.setItem('hashtag-uname', name)
    return name
  })

  return { userId, userName }
}
