'use client'
import { useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, FileCheck } from 'lucide-react'
import { toast } from 'sonner'
import { getPresignedUploadUrlAction } from '@/lib/actions/routes'

interface GpxUploadProps {
  routeId: string
  defaultGpxKey?: string
  onUploaded: (key: string, stats: { distanceKm: number; elevationM: number }) => void
}

export function GpxUpload({ routeId, defaultGpxKey, onUploaded }: GpxUploadProps) {
  const [gpxKey, setGpxKey] = useState(defaultGpxKey ?? '')
  const [uploading, setUploading] = useState(false)

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'application/gpx+xml': ['.gpx'], 'text/xml': ['.gpx'] },
    maxFiles: 1,
    onDrop: async ([file]) => {
      if (!file) return
      setUploading(true)
      try {
        const { url, key } = await getPresignedUploadUrlAction(routeId, file.name, file.type || 'application/gpx+xml', 'gpx')
        await fetch(url, { method: 'PUT', body: file, headers: { 'Content-Type': file.type || 'application/gpx+xml' } })

        const text = await file.text()
        const { parseGpxStats } = await import('@/lib/gpx')
        const stats = parseGpxStats(text)

        setGpxKey(key)
        onUploaded(key, stats)
        toast.success(`GPX caricato — ${stats.distanceKm} km, ↑${stats.elevationM} m`)
      } catch {
        toast.error('Errore nel caricamento GPX')
      } finally {
        setUploading(false)
      }
    },
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
            <FileCheck size={18} /> File GPX caricato (clicca per sostituire)
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
            <Upload size={18} />
            {uploading ? 'Caricamento...' : 'Trascina il file .gpx o clicca per selezionarlo'}
          </div>
        )}
      </div>
      <input type="hidden" name="gpxKey" value={gpxKey} />
    </div>
  )
}
