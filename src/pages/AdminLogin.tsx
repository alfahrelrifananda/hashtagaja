import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { content } from '../lib/content'
import { ThemeToggle } from '../components/ThemeToggle'
import { useTitle } from '../hooks/useTitle'
import styles from './AdminLogin.module.css'

const c = content.admin.login

export function AdminLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  useTitle('admin — hashtag')
  const navigate = useNavigate()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false); return }
    navigate('/admin/dashboard')
  }

  return (
    <div className={styles['admin-login']}>
      <header className={styles['admin-login-header']}>
        <span className={styles['admin-logo']}>{content.logo}</span>
        <ThemeToggle />
      </header>

      <main className={styles['admin-login-main']}>
        <div className={`${styles['admin-login-box']} fade-up`}>
          <div className={styles['admin-login-title-block']}>
            <h1 className={styles['admin-login-title']}>{c.title}</h1>
            <p className={styles['admin-login-sub']}>{c.subtitle}</p>
          </div>

          <form className={styles['admin-login-form']} onSubmit={handleLogin}>
            <div className={styles['admin-field']}>
              <label className={styles['admin-label']}>{c.emailLabel}</label>
              <input
                className={styles['admin-input']}
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder={c.emailPlaceholder}
                autoComplete="email"
                required
              />
            </div>

            <div className={styles['admin-field']}>
              <label className={styles['admin-label']}>{c.passwordLabel}</label>
              <input
                className={styles['admin-input']}
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={c.passwordPlaceholder}
                autoComplete="current-password"
                required
              />
            </div>

            {error && <p className={`${styles['admin-error']} fade-in`}>{error}</p>}

            <button className={styles['admin-login-btn']} type="submit" disabled={loading}>
              {loading ? c.submittingBtn : c.submitBtn}
            </button>
          </form>
        </div>
      </main>
    </div>
  )
}