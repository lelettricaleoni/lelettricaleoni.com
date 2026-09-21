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
import { GripVertical, X, Upload, Video } from 'lucide-react'
import { toast } from 'sonner'
import { r2PublicUrl } from '@/lib/r2'
import { getVideoJobStatuses } from '@/lib/actions/video-jobs'
import { recordVideoHashAction } from '@/lib/actions/media-hash'
import type { VideoJobStatus } from '@/lib/video-jobs'
import { mediaProgress, type UploadState } from '@/lib/media-progress'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'

class DuplicateUploadError extends Error {
  constructor(public sha256: string) {
    super('duplicate')
  }
}

export interface MediaItem {
  id: string
  storageKey: string
  mediaType: 'photo' | 'video'
  preview: string
  /** Shown while uploading, when the storage key means nothing to a human. */
  fileName?: string
  /** Present only until the file has finished leaving the browser. */
  upload?: UploadState
  /** Known immediately for a photo; arrives later, via polling, for a video. */
  sha256?: string
}

function ProgressBar({
  item,
  job,
}: {
  item: MediaItem
  job?: VideoJobStatus
}) {
  const progress = mediaProgress(item.mediaType, item.upload, job)
  if (!progress) return null

  const barColour =
    progress.tone === 'error' ? 'bg-destructive'
    : progress.tone === 'ready' ? 'bg-green-600'
    : 'bg-[#366DA1]'
  const textColour =
    progress.tone === 'error' ? 'text-destructive'
    : progress.tone === 'ready' ? 'text-green-700'
    : 'text-muted-foreground'

  return (
    <div className="mt-1 flex items-center gap-2" title={progress.detail}>
      <div className="flex-1 bg-muted rounded-full h-1">
        <div
          className={`${barColour} h-1 rounded-full transition-all duration-500`}
          style={{ width: `${progress.percent}%` }}
        />
      </div>
      <span className={`text-[10px] whitespace-nowrap ${textColour}`}>{progress.label}</span>
    </div>
  )
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
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: item.id,
    // Reordering something that is still arriving would fight the upload.
    disabled: Boolean(item.upload),
  })
  const uploading = Boolean(item.upload)

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-3 bg-card border rounded-lg p-2 ${uploading ? 'opacity-70' : ''}`}
    >
      {uploading ? (
        <div className="w-4 shrink-0" />
      ) : (
        <button type="button" {...attributes} {...listeners} className="text-muted-foreground hover:text-foreground cursor-grab shrink-0">
          <GripVertical size={16} />
        </button>
      )}

      {item.mediaType === 'photo' && item.preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.preview} alt="" className="w-16 h-12 object-cover rounded shrink-0" />
      ) : (
        <div className="w-16 h-12 rounded bg-muted flex items-center justify-center shrink-0">
          <Video size={20} className="text-muted-foreground" />
        </div>
      )}

      <div className="flex-1 min-w-0">
        <span className="text-xs text-muted-foreground truncate block">
          {item.fileName ?? item.storageKey.split('/').pop()}
        </span>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${item.mediaType === 'video' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
            {item.mediaType === 'video' ? 'Video' : 'Foto'}
          </span>
        </div>
        <ProgressBar item={item} job={job} />
      </div>

      {!uploading && (
        <button type="button" onClick={onRemove} className="text-destructive hover:text-destructive/80 cursor-pointer shrink-0">
          <X size={14} />
        </button>
      )}
    </div>
  )
}

export function MediaUpload({
  ownerId,
  defaultItems = [],
  getPresignedUploadUrl,
  getVideoPresignedUploadUrl,
}: {
  ownerId: string
  defaultItems?: { storageKey: string; mediaType: 'photo' | 'video' }[]
  getPresignedUploadUrl: (ownerId: string, fileName: string, contentType: string, type: 'photo') => Promise<{ url: string; key: string }>
  getVideoPresignedUploadUrl: (ownerId: string, fileName: string, contentType: string) => Promise<{ url: string; key: string }>
}) {
  const [items, setItems] = useState<MediaItem[]>(
    defaultItems.map((m) => ({
      id: m.storageKey,
      storageKey: m.storageKey,
      mediaType: m.mediaType,
      preview: m.mediaType === 'photo' ? r2PublicUrl(m.storageKey) : '',
    }))
  )
  const [jobs, setJobs] = useState<Record<string, VideoJobStatus>>({})

  // Strings, not arrays: an array literal would be a new object on every render
  // and restart the poll each time.
  const videoKeys = items
    .filter((i) => i.mediaType === 'video' && !i.upload)
    .map((i) => i.storageKey)
    .join('|')
  // Videos that arrived in this session are worth waiting on even before the
  // worker has said anything; older ones simply never had a status.
  const freshKeys = items
    .filter((i) => i.mediaType === 'video' && !i.upload && i.fileName)
    .map((i) => i.storageKey)
    .join('|')

  useEffect(() => {
    const all = videoKeys ? videoKeys.split('|') : []
    if (all.length === 0) return
    const fresh = new Set(freshKeys ? freshKeys.split('|') : [])

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    // A worker that never picks the job up must not leave the panel polling
    // forever: after this many rounds the bar simply stops moving.
    let rounds = 100

    async function tick(keys: string[]) {
      let statuses: Record<string, VideoJobStatus> = {}
      try {
        statuses = await getVideoJobStatuses(keys)
      } catch {
        // A stale bar beats an error message in the panel.
        return
      }
      if (cancelled) return
      setJobs((prev) => ({ ...prev, ...statuses }))

      const active = keys.filter((key) => {
        const phase = statuses[key]?.phase
        if (!phase) return fresh.has(key)
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

  // Once a video's job reports done with a sha256, record it — the only
  // moment it's known, since the source is gone right after. Idempotent
  // (recordVideoHashAction just re-writes the same value), so a rare double
  // call from two renders in flight at once costs nothing.
  useEffect(() => {
    for (const item of items) {
      if (item.mediaType !== 'video' || item.sha256 || item.upload) continue
      const job = jobs[item.storageKey]
      if (job?.phase !== 'done' || !job.sha256) continue
      const sha256 = job.sha256
      const storageKey = item.storageKey
      recordVideoHashAction(storageKey, sha256)
        .then(({ duplicate }) => {
          setItems((prev) => prev.map((i) => (i.storageKey === storageKey ? { ...i, sha256 } : i)))
          if (duplicate) toast.warning('Questo video sembra identico a uno già caricato altrove.')
        })
        .catch(() => { /* riprovato al prossimo render se lo stato del job resta */ })
    }
  }, [items, jobs])

  const effectiveOwnerId = useRef(
    ownerId !== 'new' ? ownerId : (() => {
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

  const [pendingDuplicate, setPendingDuplicate] = useState<{ file: File; key: string } | null>(null)

  const uploadFile = useCallback(async (file: File, opts?: { forceKey?: string }) => {
    const isVideo = file.type.startsWith('video/')

    // The key is known before a single byte moves, so the item can join the
    // list now and keep its identity all the way to "pronto". It used to live
    // in a second list and be replaced on completion, which is what put a gap
    // in the middle of the journey. A forced retry after a duplicate warning
    // reuses the same key instead of reserving a new one.
    let key: string
    let url: string | null = null
    if (opts?.forceKey) {
      key = opts.forceKey
    } else {
      try {
        const result = isVideo
          ? await getVideoPresignedUploadUrl(effectiveOwnerId, file.name, file.type)
          : await getPresignedUploadUrl(effectiveOwnerId, file.name, file.type, 'photo')
        key = result.key
        url = result.url
      } catch (err) {
        console.error(err)
        toast.error(`Caricamento fallito: ${file.name}`)
        return
      }
    }

    const preview = isVideo ? '' : URL.createObjectURL(file)
    setItems((prev) => [...prev, {
      id: key,
      storageKey: key,
      mediaType: isVideo ? 'video' : 'photo',
      preview,
      fileName: file.name,
      upload: { progress: 0 },
    }])

    const patch = (fields: Partial<MediaItem>) =>
      setItems((prev) => prev.map((i) => (i.storageKey === key ? { ...i, ...fields } : i)))

    try {
      const responseText = await new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        if (isVideo && url) {
          xhr.open('PUT', url)
          xhr.setRequestHeader('Content-Type', file.type)
        } else {
          xhr.open('POST', '/api/upload')
        }
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            patch({ upload: { progress: Math.round((e.loaded / e.total) * 100) } })
          }
        }
        xhr.onload = () => {
          if (xhr.status === 409) {
            let sha256 = ''
            try { sha256 = JSON.parse(xhr.responseText).sha256 } catch { /* ignore */ }
            reject(new DuplicateUploadError(sha256))
          } else if (xhr.status >= 200 && xhr.status < 300) {
            resolve(xhr.responseText)
          } else {
            reject(new Error(`${xhr.status}`))
          }
        }
        xhr.onerror = () => reject(new Error('Network error'))

        if (isVideo && url) {
          xhr.send(file)
        } else {
          const fd = new FormData()
          fd.append('file', file)
          fd.append('key', key)
          fd.append('kind', 'photo')
          if (opts?.forceKey) fd.append('force', 'true')
          xhr.send(fd)
        }
      })

      // A video hands its bar over to the worker's status; a photo already
      // knows its sha256 from the response body.
      if (isVideo) {
        patch({ upload: undefined })
      } else {
        let sha256: string | undefined
        try { sha256 = JSON.parse(responseText).sha256 } catch { /* ignore */ }
        patch({ upload: undefined, sha256 })
      }
    } catch (err) {
      if (err instanceof DuplicateUploadError) {
        setItems((prev) => prev.filter((i) => i.storageKey !== key))
        setPendingDuplicate({ file, key })
        return
      }
      console.error(err)
      toast.error(`Caricamento fallito: ${file.name}`)
      patch({ upload: { progress: 0, failed: true } })
    }
  }, [effectiveOwnerId, getPresignedUploadUrl, getVideoPresignedUploadUrl])

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

  // Only what has actually landed in storage is saved: a form submitted
  // mid-upload must not record a video that is not there.
  const mediaItemsJson = JSON.stringify(
    items
      .filter((i) => !i.upload)
      .map((i) => ({ key: i.storageKey, type: i.mediaType, sha256: i.sha256 }))
  )

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
        <p className="text-xs text-muted-foreground mt-1">Dopo il caricamento i video vengono preparati per la riproduzione: può volerci qualche minuto</p>
      </div>

      <input type="hidden" name="mediaItems" value={mediaItemsJson} />

      <AlertDialog open={pendingDuplicate !== null} onOpenChange={(open) => !open && setPendingDuplicate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>File già caricato</AlertDialogTitle>
            <AlertDialogDescription>
              Questa foto risulta identica a una già presente altrove sul sito. Caricarla
              comunque?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingDuplicate(null)}>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (!pendingDuplicate) return
              const { file, key } = pendingDuplicate
              setPendingDuplicate(null)
              uploadFile(file, { forceKey: key })
            }}>
              Carica comunque
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
