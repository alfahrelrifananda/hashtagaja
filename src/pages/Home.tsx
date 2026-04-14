import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ThemeToggle } from '../components/ThemeToggle'
import { SettingsModal } from '../components/SettingsModal'
import { getContent } from '../lib/content'
import { useSettings } from '../hooks/useSettings'
import { useTitle } from '../hooks/useTitle'
import styles from './Home.module.css'

export function Home() {
  const { settings } = useSettings()
  const c = getContent(settings.language).home
  const content = getContent(settings.language)

  const [input, setInput] = useState('')
  const [error, setError] = useState('')
  const [focused, setFocused] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  useTitle('hashtag')

  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  useEffect(() => { inputRef.current?.focus() }, [])

  function sanitize(raw: string): string {
    return raw.replace(/^#+/, '').replace(/[^a-z0-9_-]/gi, '').toLowerCase()
  }

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value
    setError('')
    if (raw === '#' || raw === '') { setInput(raw); return }
    const clean = sanitize(raw)
    setInput(clean ? `#${clean}` : '')
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') handleJoin()
    if (e.key === 'Backspace' && input === '#') setInput('')
  }

  function handleJoin() {
    const tag = sanitize(input)
    if (!tag) { setError(c.errors.empty); return }
    if (tag.length < 2) { setError(c.errors.tooShort); return }
    if (tag.length > 32) { setError(c.errors.tooLong); return }
    navigate(`/${tag}`)
  }

  return (
    <div className={styles.home}>
      <header className={styles['home-header']}>
        <span className={styles['home-logo']}>{content.logo}</span>
        <div className={styles['home-header-right']}>
          <button className="settings-btn" onClick={() => setShowSettings(true)}>
            {content.settings.title}
          </button>
          <ThemeToggle />
        </div>
      </header>

      <main className={styles['home-main']}>
        <div className={`${styles['home-content']} fade-up`}>
          <div className={styles['home-title-block']}>
            <h1 className={styles['home-title']}>{c.title}</h1>
            <p className={styles['home-desc']}>
              {c.desc.map((line, i) => (
                <span key={i}>{line}<br /></span>
              ))}
            </p>
          </div>

          <div className={styles['home-input-group']}>
            <div className={`${styles['home-input-wrap']} ${focused ? styles.focused : ''} ${error ? styles['has-error'] : ''}`}>
              <input
                ref={inputRef}
                className={styles['home-input']}
                type="text"
                value={input}
                onChange={handleInput}
                onKeyDown={handleKeyDown}
                onFocus={() => { setFocused(true); if (!input) setInput('#') }}
                onBlur={() => { setFocused(false); if (input === '#') setInput('') }}
                placeholder={c.inputPlaceholder}
                spellCheck={false}
                autoComplete="off"
                autoCapitalize="off"
                maxLength={33}
              />
              <button className={styles['home-enter-btn']} onClick={handleJoin} tabIndex={-1}>
                {c.enterBtn}
              </button>
            </div>
            {error && <p className={`${styles['home-error']} fade-in`}>{error}</p>}
          </div>

          <div className={styles['home-features']}>
            <p className={styles['home-features-title']}>{c.featuresTitle}</p>
            <div className={styles['home-hints']}>
              {c.hints.map((hint, i) => (
                <span key={i} className={styles['hint-item']}>
                  <span className={styles['hint-dot']} />
                  {hint}
                </span>
              ))}
            </div>
          </div>
        </div>
      </main>

      <footer className={styles['home-footer']}>
        <span className={styles['home-footer-text']}>{c.footer}</span>
      </footer>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  )
}