'use client'
import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { Video, X, CheckCircle } from 'lucide-react'
import { toast } from 'sonner'
import { getVideoPresignedUploadUrlAction } from '@/lib/actions/routes'

interface VideoUploadProps {
  routeId: string
  defaultVideoKey?: string
  onUploaded: (key: string) => void
  onRemoved: () => void
}

export function VideoUpload({ routeId, defaultVideoKey, onUploaded, onRemoved }: VideoUploadProps) {
  const [videoKey, setVideoKey] = useState<string | null>(defaultVideoKey ?? null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)

  const effectiveRouteId = routeId === 'new' ? (() => {
    if (typeof window === 'undefined') return 'new'
    const k = '__video_tmp_id'
    if (!sessionStorage.getItem(k)) sessionStorage.setItem(k, crypto.randomUUID())
    return sessionStorage.getItem(k)!
  })() : routeId

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0]
    if (!file) return
    setUploading(true)
    setProgress(0)
    try {
      const { url, key } = await getVideoPresignedUploadUrlAction(effectiveRouteId, file.name, file.type)
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('PUT', url)
        xhr.setRequestHeader('Content-Type', file.type)
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100))
        }
        xhr.onload = () =>
          xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`${xhr.status}`))
        xhr.onerror = () => reject(new Error('Network error'))
        xhr.send(file)
      })
      setVideoKey(key)
      onUploaded(key)
      toast.success('Video caricato')
    } catch (err) {
      console.error(err)
      toast.error('Caricamento video fallito')
    } finally {
      setUploading(false)
      setProgress(0)
    }
  }, [effectiveRouteId, onUploaded])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'video/*': ['.mp4', '.mov', '.avi', '.mkv', '.webm'] },
    maxFiles: 1,
    disabled: uploading,
    onDrop,
  })

  if (videoKey && !uploading) {
    return (
      <div className="flex items-center gap-3 bg-card border rounded-lg p-3">
        <CheckCircle size={18} className="text-green-500 shrink-0" />
        <span className="text-sm flex-1 truncate font-mono">{videoKey.split('/').pop()}</span>
        <button
          type="button"
          onClick={() => { setVideoKey(null); onRemoved() }}
          className="text-destructive hover:text-destructive/80 cursor-pointer"
        >
          <X size={14} />
        </button>
      </div>
    )
  }

  return (
    <div
      {...getRootProps()}
      className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
        isDragActive ? 'border-[#366DA1] bg-blue-50' : 'border-muted hover:border-[#366DA1]'
      } ${uploading ? 'pointer-events-none opacity-60' : ''}`}
    >
      <input {...getInputProps()} />
      <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
        <Video size={24} />
        {uploading
          ? <span>Caricamento... {progress}%</span>
          : <span>Trascina il video qui o clicca per selezionarlo (.mp4, .mov, .avi, .mkv)</span>
        }
      </div>
      {uploading && (
        <div className="mt-3 w-full bg-muted rounded-full h-1.5">
          <div
            className="bg-[#366DA1] h-1.5 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  )
}
