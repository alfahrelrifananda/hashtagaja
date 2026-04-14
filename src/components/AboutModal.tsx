import styles from './AboutModal.module.css'

interface Props {
  onClose: () => void
}

export function AboutModal({ onClose }: Props) {
  return (
    <div className={`${styles['about-overlay']} fade-in`} onClick={onClose}>
      <div className={styles['about-box']} onClick={e => e.stopPropagation()}>
        <div className={styles['about-header']}>
          <span className={styles['about-logo']}>#</span>
          <button className={styles['about-close']} onClick={onClose}>tutup</button>
        </div>

        <div className={styles['about-body']}>
          <div className={styles['about-section']}>
            <h2 className={styles['about-title']}>hashtag</h2>
            <p className={styles['about-desc']}>
              ruangan obrolan sementara berbasis hashtag. tidak perlu akun.
              semua pesan dan file terhapus otomatis setelah 24 jam.
            </p>
          </div>

          <div className={styles['about-section']}>
            <p className={styles['about-label']}>dibuat oleh</p>
            <p className={styles['about-value']}>
              <a href="https://github.com/alfahrelrifananda" target="_blank" rel="noopener noreferrer" className={styles['about-link']}>
                @alfahrelrifananda
              </a>
            </p>
          </div>

          <div className={styles['about-section']}>
            <p className={styles['about-label']}>kode sumber</p>
            <p className={styles['about-value']}>
              <a href="https://github.com/alfahrelrifananda/hashtagaja" target="_blank" rel="noopener noreferrer" className={styles['about-link']}>
                github.com/alfahrelrifananda/hashtag
              </a>
            </p>
          </div>

          <div className={styles['about-section']}>
            <p className={styles['about-label']}>lisensi</p>
            <p className={styles['about-value']}>MIT License</p>
          </div>

          <div className={styles['about-section']}>
            <p className={styles['about-label']}>dibangun dengan</p>
            <div className={styles['about-tags']}>
              <span className={styles['about-tag']}>React</span>
              <span className={styles['about-tag']}>TypeScript</span>
              <span className={styles['about-tag']}>Vite</span>
              <span className={styles['about-tag']}>Supabase</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
