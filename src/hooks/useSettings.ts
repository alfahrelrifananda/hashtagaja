import { useState, useEffect } from 'react'

export type Language = 'id' | 'en'
export type FontFamily = 'jetbrains' | 'lora' | 'dm-sans'

export interface Settings {
  language: Language
  font: FontFamily
}

const FONTS: Record<FontFamily, string> = {
  'jetbrains': "'JetBrains Mono', 'Courier New', monospace",
  'lora':      "'Lora', Georgia, serif",
  'dm-sans':   "'DM Sans', system-ui, sans-serif",
}

const DEFAULT: Settings = { language: 'id', font: 'jetbrains' }

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(() => {
    try {
      const stored = localStorage.getItem('hashtag-settings')
      if (stored) {
        const parsed = { ...DEFAULT, ...JSON.parse(stored) }
        // apply font immediately on init before first render
        document.documentElement.style.setProperty('--font', FONTS[parsed.font as FontFamily] ?? FONTS[DEFAULT.font])
        return parsed
      }
    } catch {}
    return DEFAULT
  })

  useEffect(() => {
    localStorage.setItem('hashtag-settings', JSON.stringify(settings))
    document.documentElement.style.setProperty('--font', FONTS[settings.font])
  }, [settings])

  function update(patch: Partial<Settings>) {
    setSettings(prev => ({ ...prev, ...patch }))
  }

  return { settings, update, FONTS }
}

export const FONT_LABELS: Record<FontFamily, string> = {
  'jetbrains': 'JetBrains Mono',
  'lora':      'Lora',
  'dm-sans':   'DM Sans',
}

export const FONT_DESC: Record<FontFamily, string> = {
  'jetbrains': 'monospace',
  'lora':      'serif',
  'dm-sans':   'sans-serif',
}