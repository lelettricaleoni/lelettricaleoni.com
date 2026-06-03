'use client'
import { useState } from 'react'
import { Download, FileDown, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

interface RouteGpxModalProps {
  shortId: string
  routeName: string
  dict: { routes: Record<string, string> }
}

export function RouteGpxModal({ shortId, routeName, dict }: RouteGpxModalProps) {
  const [open, setOpen] = useState(false)
  const d = dict.routes

  function handleDownload() {
    const a = document.createElement('a')
    a.href = `/api/routes/${shortId}/gpx`
    a.download = `${routeName}.gpx`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.gtag?.('event', 'download_gpx', { route: shortId })
    setOpen(false)
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Download size={14} className="mr-1.5" />
        {d.download_gpx}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-full bg-[#1e3a5f]/10 flex items-center justify-center shrink-0">
                <FileDown size={20} className="text-[#1e3a5f]" />
              </div>
              <div>
                <DialogTitle className="text-[#1e3a5f]">{d.gpx_modal_title}</DialogTitle>
                <DialogDescription className="text-xs mt-0.5">{d.gpx_modal_subtitle}</DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-5 pt-1">
            {/* Note watermark */}
            <div className="flex items-start gap-2.5 rounded-lg bg-muted/60 px-3.5 py-2.5">
              <Info size={14} className="text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground leading-relaxed">{d.gpx_modal_note}</p>
            </div>

            {/* Download button */}
            <Button
              className="w-full bg-[#1e3a5f] hover:bg-[#2a4f7f] text-white"
              onClick={handleDownload}
            >
              <Download size={16} className="mr-2" />
              {d.gpx_modal_download}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
