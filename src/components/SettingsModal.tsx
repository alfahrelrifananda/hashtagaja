import { useState } from 'react'
import { useSettings, FONT_LABELS, FONT_DESC, type FontFamily, type Language } from '../hooks/useSettings'
import { getContent } from '../lib/content'
import styles from './SettingsModal.module.css'

interface Props {
  onClose: () => void
}

export function SettingsModal({ onClose }: Props) {
  const { settings, update, FONTS } = useSettings()
  const c = getContent(settings.language).settings

  // pending state — not saved until user clicks save
  const [pending, setPending] = useState({ ...settings })
  const hasChanges = pending.language !== settings.language || pending.font !== settings.font

  const fonts: FontFamily[] = ['jetbrains', 'lora', 'dm-sans']
  const langs: Language[] = ['id', 'en']

  function handleSave() {
    update(pending)
    // small delay so settings are written to localStorage before reload
    setTimeout(() => window.location.reload(), 80)
  }

  return (
    <div className={`${styles.overlay} fade-in`} onClick={onClose}>
      <div className={styles.box} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className={styles.header}>
          <span className={styles.title}>{c.title}</span>
          <button className={styles.closeBtn} onClick={onClose}>{c.closeBtn}</button>
        </div>

        <div className={styles.body}>

          {/* Language */}
          <div className={styles.section}>
            <p className={styles.label}>{c.languageLabel}</p>
            <div className={styles.options}>
              {langs.map(lang => (
                <button
                  key={lang}
                  className={`${styles.option} ${pending.language === lang ? styles.active : ''}`}
                  onClick={() => setPending(p => ({ ...p, language: lang }))}
                >
                  {c.languages[lang]}
                </button>
              ))}
            </div>
          </div>

          {/* Font */}
          <div className={styles.section}>
            <p className={styles.label}>{c.fontLabel}</p>
            <div className={styles.options}>
              {fonts.map(font => (
                <button
                  key={font}
                  className={`${styles.option} ${styles['font-option']} ${pending.font === font ? styles.active : ''}`}
                  onClick={() => setPending(p => ({ ...p, font }))}
                >
                  <span style={{ fontFamily: FONTS[font], display: 'block', fontSize: '0.9rem' }}>{FONT_LABELS[font]}</span>
                  <span style={{ fontSize: '0.65rem', opacity: 0.6, display: 'block', marginTop: '2px' }}>{FONT_DESC[font]}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Save button — only shown when there are changes */}
          {hasChanges && (
            <button className={styles.saveBtn} onClick={handleSave}>
              {c.saveBtn} →
            </button>
          )}

          {/* Divider */}
          <div className={styles.divider} />

          {/* About */}
          <div className={styles.section}>
            <h2 className={styles.aboutTitle}>{c.aboutTitle}</h2>
            <p className={styles.aboutDesc}>{c.aboutDesc}</p>
          </div>

          <div className={styles.infoGrid}>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>{c.madeBy}</span>
              <a href="https://github.com/alfahrelrifananda" target="_blank" rel="noopener noreferrer" className={styles.infoLink}>
                @alfahrelrifananda
              </a>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>{c.sourceCode}</span>
              <a href="https://github.com/alfahrelrifananda/hashtagaja" target="_blank" rel="noopener noreferrer" className={styles.infoLink}>
                github.com/alfahrelrifananda/hashtag
              </a>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>{c.license}</span>
              <span className={styles.infoValue}>MIT</span>
            </div>
          </div>

          <div className={styles.tags}>
            {['React', 'TypeScript', 'Vite', 'Supabase'].map(t => (
              <span key={t} className={styles.tag}>{t}</span>
            ))}
          </div>

        </div>
      </div>
    </div>
  )
}