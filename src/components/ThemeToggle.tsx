import { useTheme } from '../hooks/useTheme'
import styles from './ThemeToggle.module.css'

export function ThemeToggle() {
  const { theme, toggle } = useTheme()

  return (
    <button
      className={styles['theme-toggle']}
      onClick={toggle}
      aria-label={`ganti ke mode ${theme === 'light' ? 'gelap' : 'terang'}`}
      title={`ganti ke mode ${theme === 'light' ? 'gelap' : 'terang'}`}
    >
      {theme === 'light' ? 'gelap' : 'terang'}
    </button>
  )
}