'use client'
import { Share2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

export function RouteShareButton({ url, label, copiedLabel }: { url: string; label: string; copiedLabel: string }) {
  function handleShare() {
    navigator.clipboard.writeText(url)
    toast.success(copiedLabel)
    if (typeof window !== 'undefined') {
      window.gtag?.('event', 'share_route', { method: 'copy_link', url })
    }
  }
  return (
    <Button variant="outline" size="sm" onClick={handleShare}>
      <Share2 size={14} className="mr-1.5" /> {label}
    </Button>
  )
}
