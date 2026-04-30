import { useEffect, useRef } from 'react'

interface AdBannerProps {
  slot: string
  format?: 'auto' | 'vertical' | 'rectangle'
}

export function AdBanner({ slot, format = 'auto' }: AdBannerProps) {
  const ref = useRef<HTMLModElement>(null)

  useEffect(() => {
    try {
      const adsbygoogle = (window as any).adsbygoogle
      if (adsbygoogle) adsbygoogle.push({})
    } catch (e) {}
  }, [])

  return (
    <ins
      ref={ref}
      className="adsbygoogle"
      style={{ display: 'block', width: '100%', height: '100%' }}
      data-ad-client="ca-pub-XXXXXXXXXXXXXXXX"
      data-ad-slot={slot}
      data-ad-format={format}
      data-full-width-responsive="false"
    />
  )
}