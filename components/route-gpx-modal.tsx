'use client'
import { useState } from 'react'
import { Download, FileDown, Info, CheckCircle2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { useFileDownload, formatBytes, formatTimeRemaining } from '@/lib/hooks/use-file-download'
import { trackEvent } from '@/lib/analytics'

interface RouteGpxModalProps {
  shortId: string
  routeName: string
  dict: { routes: Record<string, string> }
}

export function RouteGpxModal({ shortId, routeName, dict }: RouteGpxModalProps) {
  const [open, setOpen] = useState(false)
  const { status, progress, bytesLoaded, bytesTotal, timeRemainingS, error, download, reset } = useFileDownload()
  const d = dict.routes

  function handleDownload() {
    download(`/api/routes/${shortId}/gpx`, `${routeName}.gpx`)
    trackEvent('download_gpx', { route: shortId })
  }

  function handleClose(v: boolean) {
    if (!v && status === 'downloading') return // block accidental close during download
    setOpen(v)
    if (!v) reset()
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Download size={14} className="mr-1.5" />
        {d.download_gpx}
      </Button>

      <Dialog open={open} onOpenChange={handleClose}>
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
            <div className="flex items-start gap-2.5 rounded-lg bg-muted/60 px-3.5 py-2.5">
              <Info size={14} className="text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground leading-relaxed">{d.gpx_modal_note}</p>
            </div>

            {/* Downloading state */}
            {status === 'downloading' && (
              <div className="space-y-2.5">
                <Progress value={progress} className="h-2" />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {bytesTotal > 0
                      ? `${formatBytes(bytesLoaded)} / ${formatBytes(bytesTotal)}`
                      : formatBytes(bytesLoaded)}
                  </span>
                  <span className="font-medium text-[#1e3a5f]">
                    {bytesTotal > 0 ? `${progress}%` : '...'}
                    {timeRemainingS !== null && ` — ${formatTimeRemaining(timeRemainingS)}`}
                  </span>
                </div>
              </div>
            )}

            {/* Done state */}
            {status === 'done' && (
              <div className="flex items-center gap-2.5 rounded-lg bg-green-50 border border-green-200 px-3.5 py-2.5">
                <CheckCircle2 size={16} className="text-green-600 shrink-0" />
                <p className="text-sm text-green-700 font-medium">File scaricato con successo.</p>
              </div>
            )}

            {/* Error state */}
            {status === 'error' && (
              <div className="flex items-center gap-2.5 rounded-lg bg-red-50 border border-red-200 px-3.5 py-2.5">
                <AlertCircle size={16} className="text-red-600 shrink-0" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {/* Action button */}
            {status === 'idle' || status === 'error' ? (
              <Button
                className="w-full bg-[#1e3a5f] hover:bg-[#2a4f7f] text-white"
                onClick={handleDownload}
              >
                <Download size={16} className="mr-2" />
                {d.gpx_modal_download}
              </Button>
            ) : status === 'done' ? (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => handleClose(false)}
              >
                Chiudi
              </Button>
            ) : (
              <Button className="w-full bg-[#1e3a5f] text-white opacity-60" disabled>
                <Download size={16} className="mr-2 animate-bounce" />
                Download in corso...
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
