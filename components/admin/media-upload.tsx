'use client'
import { useState, useCallback, useRef, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import {
  DndContext, closestCenter,
  KeyboardSensor, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import {
  SortableContext, sortableKeyboardCoordinates,
  useSortable, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, X, Upload, Video, Image } from 'lucide-react'
import { toast } from 'sonner'
import { r2PublicUrl } from '@/lib/r2'
import { getPresignedUploadUrlAction, getVideoPresignedUploadUrlAction } from '@/lib/actions/routes'
import { getVideoJobStatuses } from '@/lib/actions/video-jobs'
import type { VideoJobStatus } from '@/lib/video-jobs'

export interface MediaItem {
  id: string
  storageKey: string
  mediaType: 'photo' | 'video'
  preview: string
  /** Uploaded in this session: the worker may not have noticed it yet. */
  isNew?: boolean
}

const PHASE_LABELS: Record<VideoJobStatus['phase'], string> = {
  queued: 'In coda',
  downloading: 'Scaricamento',
  transcoding: 'Elaborazione',
  uploading: 'Salvataggio',
  done: 'Pronto',
  failed: 'Non riuscito',
}

function VideoJobBadge({ job, isNew }: { job?: VideoJobStatus; isNew?: boolean }) {
  // A video uploaded a moment ago has no status yet: the worker finds it by
  // listing the bucket, so there is a gap between the upload and the first
  // report. Saying nothing there would look like nothing is happening.
  if (!job) {
    if (!isNew) return null
    return <span className="text-[10px] text-muted-foreground">In attesa del worker…</span>
  }

  if (job.phase === 'failed') {
    return (
      <span className="text-[10px] font-medium text-destructive" title={job.error}>
        {PHASE_LABELS.failed}
        {job.attempt ? ` dopo ${job.attempt} tentativi` : ''}
      </span>
    )
  }

  if (job.phase === 'done') {
    return <span className="text-[10px] font-medium text-green-700">{PHASE_LABELS.done}</span>
  }

  const pct = job.progress ?? 0
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 bg-muted rounded-full h-1">
        <div className="bg-[#366DA1] h-1 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-muted-foreground">
        {PHASE_LABELS[job.phase]}{job.phase === 'transcoding' ? ` ${pct}%` : ''}
      </span>
    </div>
  )
}

interface UploadingItem {
  id: string
  name: string
  mediaType: 'photo' | 'video'
  progress: number
}

function SortableItem({
  item,
  job,
  onRemove,
}: {
  item: MediaItem
  job?: VideoJobStatus
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.id })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="flex items-center gap-3 bg-card border rounded-lg p-2"
    >
      <button type="button" {...attributes} {...listeners} className="text-muted-foreground hover:text-foreground cursor-grab shrink-0">
        <GripVertical size={16} />
      </button>
      {item.mediaType === 'photo' ? (
        <img src={item.preview} alt="" className="w-16 h-12 object-cover rounded shrink-0" />
      ) : (
        <div className="w-16 h-12 rounded bg-muted flex items-center justify-center shrink-0">
          <Video size={20} className="text-muted-foreground" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <span className="text-xs text-muted-foreground truncate block">{item.storageKey.split('/').pop()}</span>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${item.mediaType === 'video' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
            {item.mediaType === 'video' ? 'Video' : 'Foto'}
          </span>
          {item.mediaType === 'video' && <VideoJobBadge job={job} isNew={item.isNew} />}
        </div>
      </div>
      <button type="button" onClick={onRemove} className="text-destructive hover:text-destructive/80 cursor-pointer shrink-0">
        <X size={14} />
      </button>
    </div>
  )
}

function ProgressItem({ item }: { item: UploadingItem }) {
  return (
    <div className="flex items-center gap-3 bg-card border rounded-lg p-2 opacity-70">
      <div className="w-4 shrink-0" />
      <div className="w-16 h-12 rounded bg-muted flex items-center justify-center shrink-0">
        {item.mediaType === 'video' ? <Video size={20} className="text-muted-foreground" /> : <Image size={20} className="text-muted-foreground" />}
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-xs text-muted-foreground truncate block">{item.name}</span>
        <div className="mt-1 w-full bg-muted rounded-full h-1.5">
          <div
            className="bg-[#366DA1] h-1.5 rounded-full transition-all duration-200"
            style={{ width: `${item.progress}%` }}
          />
        </div>
        <span className="text-[10px] text-muted-foreground">{item.progress}%</span>
      </div>
    </div>
  )
}

export function MediaUpload({
  routeId,
  defaultItems = [],
}: {
  routeId: string
  defaultItems?: { storageKey: string; mediaType: 'photo' | 'video' }[]
}) {
  const [items, setItems] = useState<MediaItem[]>(
    defaultItems.map((m) => ({
      id: m.storageKey,
      storageKey: m.storageKey,
      mediaType: m.mediaType,
      preview: m.mediaType === 'photo' ? r2PublicUrl(m.storageKey) : '',
    }))
  )
  const [uploading, setUploading] = useState<UploadingItem[]>([])
  const [jobs, setJobs] = useState<Record<string, VideoJobStatus>>({})

  // A string, not an array: an array literal would be a new object on every
  // render and restart the poll each time.
  const videoKeys = items.filter((i) => i.mediaType === 'video').map((i) => i.storageKey).join('|')
  const freshKeys = items.filter((i) => i.mediaType === 'video' && i.isNew).map((i) => i.storageKey).join('|')

  useEffect(() => {
    const all = videoKeys ? videoKeys.split('|') : []
    if (all.length === 0) return
    const fresh = new Set(freshKeys ? freshKeys.split('|') : [])

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    // A worker that never picks the job up must not leave the panel polling
    // forever: after this many rounds the badge simply stops moving.
    let rounds = 100

    async function tick(keys: string[]) {
      let statuses: Record<string, VideoJobStatus> = {}
      try {
        statuses = await getVideoJobStatuses(keys)
      } catch {
        // The panel showing a stale badge beats it showing an error.
        return
      }
      if (cancelled) return
      setJobs((prev) => ({ ...prev, ...statuses }))

      const active = keys.filter((k) => {
        const phase = statuses[k]?.phase
        // No status at all is only worth waiting on for something just
        // uploaded; an older video simply never had one.
        if (!phase) return fresh.has(k)
        return phase !== 'done' && phase !== 'failed'
      })

      if (active.length > 0 && (rounds -= 1) > 0) {
        timer = setTimeout(() => tick(active), 3000)
      }
    }

    tick(all)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [videoKeys, freshKeys])

  const effectiveRouteId = useRef(
    routeId !== 'new' ? routeId : (() => {
      if (typeof window === 'undefined') return 'new'
      const k = '__media_tmp_id'
      if (!sessionStorage.getItem(k)) sessionStorage.setItem(k, crypto.randomUUID())
      return sessionStorage.getItem(k)!
    })()
  ).current

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const uploadFile = useCallback(async (file: File) => {
    const isVideo = file.type.startsWith('video/')
    const tempId = crypto.randomUUID()
    setUploading((prev) => [...prev, { id: tempId, name: file.name, mediaType: isVideo ? 'video' : 'photo', progress: 0 }])

    try {
      let key: string
      let url: string | null = null

      if (isVideo) {
        const result = await getVideoPresignedUploadUrlAction(effectiveRouteId, file.name, file.type)
        key = result.key
        url = result.url
      } else {
        const result = await getPresignedUploadUrlAction(effectiveRouteId, file.name, file.type, 'photo')
        key = result.key
        url = result.url
      }

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        if (isVideo && url) {
          xhr.open('PUT', url)
          xhr.setRequestHeader('Content-Type', file.type)
        } else {
          xhr.open('POST', '/api/upload')
        }
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100)
            setUploading((prev) => prev.map((u) => u.id === tempId ? { ...u, progress: pct } : u))
          }
        }
        xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`${xhr.status}`))
        xhr.onerror = () => reject(new Error('Network error'))

        if (isVideo && url) {
          xhr.send(file)
        } else {
          const fd = new FormData()
          fd.append('file', file)
          fd.append('key', key)
          xhr.send(fd)
        }
      })

      const newItem: MediaItem = {
        id: key,
        storageKey: key,
        mediaType: isVideo ? 'video' : 'photo',
        preview: isVideo ? '' : URL.createObjectURL(file),
        isNew: isVideo,
      }
      setItems((prev) => [...prev, newItem])
    } catch (err) {
      console.error(err)
      toast.error(`Caricamento fallito: ${file.name}`)
    } finally {
      setUploading((prev) => prev.filter((u) => u.id !== tempId))
    }
  }, [effectiveRouteId])

  const onDrop = useCallback((acceptedFiles: File[]) => {
    for (const file of acceptedFiles) uploadFile(file)
  }, [uploadFile])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'image/*': ['.jpg', '.jpeg', '.webp', '.png'],
      'video/*': ['.mp4', '.mov', '.avi', '.mkv', '.webm'],
    },
    onDrop,
  })

  function handleDragEnd(event: { active: { id: string }; over: { id: string } | null }) {
    const { active, over } = event
    if (over && active.id !== over.id) {
      setItems((prev) => {
        const oldIndex = prev.findIndex((i) => i.id === active.id)
        const newIndex = prev.findIndex((i) => i.id === over.id)
        return arrayMove(prev, oldIndex, newIndex)
      })
    }
  }

  const mediaItemsJson = JSON.stringify(items.map((i) => ({ key: i.storageKey, type: i.mediaType })))

  return (
    <div className="space-y-2">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd as Parameters<typeof DndContext>[0]['onDragEnd']}>
        <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          {items.map((item) => (
            <SortableItem
              key={item.id}
              item={item}
              job={jobs[item.storageKey]}
              onRemove={() => setItems((prev) => prev.filter((i) => i.id !== item.id))}
            />
          ))}
        </SortableContext>
      </DndContext>

      {uploading.map((u) => <ProgressItem key={u.id} item={u} />)}

      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
          isDragActive ? 'border-[#366DA1] bg-blue-50' : 'border-muted hover:border-[#366DA1]'
        }`}
      >
        <input {...getInputProps()} />
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Upload size={16} />
          <span>Aggiungi foto o video (trascina o clicca)</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">Foto → R2 · Video → MinIO private/</p>
      </div>

      <input type="hidden" name="mediaItems" value={mediaItemsJson} />
    </div>
  )
}
