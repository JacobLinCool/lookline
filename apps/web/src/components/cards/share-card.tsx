'use client'

import { useState } from 'react'
import { Download, Link2, Share2 } from 'lucide-react'
import { Button } from '@/components/ui'

/**
 * Sharing a card outward (#38): the system share sheet where the device has one, and a download
 * plus a copied link everywhere else.
 *
 * The button only claims what the device will actually do — `navigator.share` is feature-detected
 * rather than assumed, and nothing here promises a one-tap post to any particular app, because
 * whether that works depends on the device and cannot be known from here.
 */
export function ShareCard({
  title,
  imageUrl,
  verifyCode,
}: {
  title: string
  imageUrl: string
  verifyCode: string
}) {
  const [said, setSaid] = useState<string | null>(null)
  const verifyUrl =
    typeof window === 'undefined' ? '' : `${window.location.origin}/verify/${verifyCode}`

  const say = (message: string) => {
    setSaid(message)
    window.setTimeout(() => setSaid(null), 2400)
  }

  const shareFile = async () => {
    try {
      const response = await fetch(imageUrl)
      const blob = await response.blob()
      const file = new File([blob], `${verifyCode || 'lookline'}.svg`, { type: blob.type })
      // Ask first: a browser that lists `share` may still refuse this particular file.
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title, text: `${title} · ${verifyCode}`, files: [file] })
        return
      }
      if (navigator.share) {
        await navigator.share({ title, text: `${title} · ${verifyCode}`, url: verifyUrl })
        return
      }
      say('這個瀏覽器沒有系統分享，請用下載或複製連結。')
    } catch {
      // An abort is the visitor changing their mind; nothing to report.
    }
  }

  const download = () => {
    const a = document.createElement('a')
    a.href = imageUrl
    a.download = `${verifyCode || 'lookline'}.svg`
    a.click()
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(verifyUrl)
      say('連結已複製')
    } catch {
      say('複製失敗，請手動選取網址。')
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" icon={<Share2 />} onClick={shareFile}>
          分享
        </Button>
        <Button size="sm" variant="secondary" icon={<Download />} onClick={download}>
          下載圖片
        </Button>
        <Button size="sm" variant="secondary" icon={<Link2 />} onClick={copy}>
          複製查證連結
        </Button>
      </div>
      <p aria-live="polite" className="text-[12px] text-muted">
        {said ?? `查證編號 ${verifyCode}`}
      </p>
    </div>
  )
}
