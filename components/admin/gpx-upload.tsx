'use client'
import { useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, FileCheck } from 'lucide-react'
import { toast } from 'sonner'
import { getPresignedUploadUrlAction } from '@/lib/actions/routes'
import { gpxPointsToSvgPath } from '@/lib/gpx-svg'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface GpxUploadProps {
  routeId: string
  defaultGpxKey?: string
  onUploaded: (key: string, stats: { distanceKm: number; elevationM: number; durationMin?: number }) => void
}

export function GpxUpload({ routeId, defaultGpxKey, onUploaded }: GpxUploadProps) {
  const [gpxKey, setGpxKey] = useState(defaultGpxKey ?? '')
  const [gpxSha256, setGpxSha256] = useState('')
  const [previewPath, setPreviewPath] = useState('')
  const [uploading, setUploading] = useState(false)
  const [pendingDuplicate, setPendingDuplicate] = useState<File | null>(null)
  // For new routes, generate a stable UUID for the session
  const effectiveRouteId = routeId === 'new' ? (() => {
    if (typeof window === 'undefined') return 'new'
    const k = '__gpx_tmp_id'
    if (!sessionStorage.getItem(k)) sessionStorage.setItem(k, crypto.randomUUID())
    return sessionStorage.getItem(k)!
  })() : routeId

  async function doUpload(file: File, force = false) {
    setUploading(true)
    try {
      const { key } = await getPresignedUploadUrlAction(effectiveRouteId, file.name, file.type || 'application/gpx+xml', 'gpx')
      const fd = new FormData()
      fd.append('file', file)
      fd.append('key', key)
      fd.append('kind', 'gpx')
      if (force) fd.append('force', 'true')
      const uploadRes = await fetch('/api/upload', { method: 'POST', body: fd })

      if (uploadRes.status === 409) {
        setPendingDuplicate(file)
        return
      }
      if (!uploadRes.ok) throw new Error(`Upload ${uploadRes.status}: ${await uploadRes.text()}`)

      const { sha256 } = await uploadRes.json()
      const text = await file.text()
      const { parseGpxStats, parseGpxPoints } = await import('@/lib/gpx')
      const stats = parseGpxStats(text)
      const points = parseGpxPoints(text)

      setGpxKey(key)
      setGpxSha256(typeof sha256 === 'string' ? sha256 : '')
      setPreviewPath(gpxPointsToSvgPath(points))
      onUploaded(key, stats)
      const dur = stats.durationMin ? `, ${Math.floor(stats.durationMin / 60)}h${stats.durationMin % 60 > 0 ? `${stats.durationMin % 60}m` : ''}` : ''
      toast.success(`GPX uploaded — ${stats.distanceKm} km, +${stats.elevationM} m${dur}`)
    } catch (err) {
      console.error('GPX upload error:', err)
      toast.error(`GPX error: ${err instanceof Error ? err.message : 'unknown'}`)
    } finally {
      setUploading(false)
    }
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'application/gpx+xml': ['.gpx'], 'text/xml': ['.gpx'] },
    maxFiles: 1,
    onDrop: ([file]) => { if (file) doUpload(file) },
  })

  return (
    <div>
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
          isDragActive ? 'border-[#366DA1] bg-blue-50' : 'border-muted hover:border-[#366DA1]'
        }`}
      >
        <input {...getInputProps()} />
        {gpxKey ? (
          <div className="flex items-center justify-center gap-2 text-sm text-green-600">
            <FileCheck size={18} /> GPX file uploaded (click to replace)
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
            <Upload size={18} />
            {uploading ? 'Uploading...' : 'Drop the .gpx file here or click to select'}
          </div>
        )}
      </div>

      {previewPath && (
        <div className="mt-2 w-full h-32 bg-[#e8f0f7] rounded-lg overflow-hidden">
          <svg viewBox="0 0 200 200" className="w-full h-full" style={{ padding: '12px' }}>
            <path d={previewPath} fill="none" stroke="#366DA1" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      )}

      <input type="hidden" name="gpxKey" value={gpxKey} />
      <input type="hidden" name="gpxSha256" value={gpxSha256} />

      <AlertDialog open={pendingDuplicate !== null} onOpenChange={(open) => !open && setPendingDuplicate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>GPX già caricato</AlertDialogTitle>
            <AlertDialogDescription>
              Questo tracciato risulta identico a uno già presente su un altro percorso.
              Caricarlo comunque?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingDuplicate(null)}>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              const file = pendingDuplicate
              setPendingDuplicate(null)
              if (file) doUpload(file, true)
            }}>
              Carica comunque
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
