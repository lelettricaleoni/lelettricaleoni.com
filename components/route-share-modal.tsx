'use client'
import { SiWhatsapp } from 'react-icons/si'
import { useState } from 'react'
import { LuShare2, LuCopy, LuCheck, LuMessageCircle } from 'react-icons/lu'
import { trackEvent } from '@/lib/analytics'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

interface RouteShareModalProps {
  url: string
  routeName: string
  dict: { routes: Record<string, string> }
}

export function RouteShareModal({ url, routeName, dict }: RouteShareModalProps) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const d = dict.routes

  const hasNativeShare = typeof navigator !== 'undefined' && !!navigator.share

  function handleOpen() {
    setOpen(true)
    trackEvent('share_route', { method: 'modal_open', url })
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    trackEvent('share_route', { method: 'copy_link', url })
  }

  async function handleNativeShare() {
    try {
      await navigator.share({ title: routeName, url })
      trackEvent('share_route', { method: 'native', url })
    } catch {
      // user cancelled
    }
  }

  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(`${routeName}: ${url}`)}`

  return (
    <>
      <Button variant="outline" size="sm" onClick={handleOpen}>
        <LuShare2 size={14} className="mr-1.5" />
        {d.share}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-full bg-[#366DA1]/10 flex items-center justify-center shrink-0">
                <LuShare2 size={20} className="text-[#366DA1]" />
              </div>
              <div>
                <DialogTitle className="text-[#1e3a5f]">{d.share_modal_title}</DialogTitle>
                <DialogDescription className="text-xs mt-0.5">{d.share_modal_subtitle}</DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 pt-1">
            {/* URL field */}
            <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2.5">
              <span className="flex-1 text-xs text-muted-foreground truncate select-all">{url}</span>
              <button
                onClick={handleCopy}
                className="shrink-0 text-muted-foreground hover:text-[#366DA1] transition-colors cursor-pointer"
                aria-label={d.share_modal_copy}
              >
                {copied ? <LuCheck size={15} className="text-green-600" /> : <LuCopy size={15} />}
              </button>
            </div>

            {/* Action buttons */}
            <div className="grid gap-2">
              <Button
                variant={copied ? 'default' : 'outline'}
                className={copied ? 'bg-green-600 hover:bg-green-700 text-white border-0' : ''}
                onClick={handleCopy}
              >
                {copied
                  ? <><LuCheck size={15} className="mr-2" />{d.share_modal_copied}</>
                  : <><LuCopy size={15} className="mr-2" />{d.share_modal_copy}</>
                }
              </Button>

              <Button asChild variant="outline" className="border-[#25D366] text-[#25D366] hover:bg-[#25D366]/5">
                <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>
                  <SiWhatsapp size={15} className="mr-2" aria-hidden="true" />
                  {d.share_modal_whatsapp}
                </a>
              </Button>

              {hasNativeShare && (
                <Button variant="outline" onClick={handleNativeShare}>
                  <LuShare2 size={15} className="mr-2" />
                  {d.share_modal_native}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
