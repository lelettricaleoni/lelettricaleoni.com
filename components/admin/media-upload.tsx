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
import { GripVertical, X, Upload, Video, ImageIcon } from 'lucide-react'
import { toast } from 'sonner'
import { photoUrl, isStagedPhotoKey } from '@/lib/media-client'
import { getMediaJobStatuses } from '@/lib/actions/media-jobs'
import { recordMediaHashAction, findDuplicateMediaAction } from '@/lib/actions/media-hash'
import { sha256HexOfFile, BROWSER_HASH_MAX_BYTES } from '@/lib/hash-client'
import type { VideoJobStatus } from '@/lib/video-jobs'
import { mediaProgress, type UploadState } from '@/lib/media-progress'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'

const VIDEO_EXTENSION = /\.(mp4|mov|avi|mkv|webm)$/i

export interface MediaItem {
  id: string
  storageKey: string
  mediaType: 'photo' | 'video'
  preview: string
  /** Shown while uploading, when the storage key means nothing to a human. */
  fileName?: string
  /** Present only until the file has finished leaving the browser. */
  upload?: UploadState
  /** Known before upload for a photo the browser could hash; otherwise arrives later, from the worker. */
  sha256?: string
}

function ProgressBar({
  item,
  job,
}: {
  item: MediaItem
  job?: VideoJobStatus
}) {
  // Something the panel merely loaded has no status once the worker's has
  // expired; only what was uploaded in this session is worth waiting on.
  const progress = mediaProgress(item.mediaType, item.upload, job, {
    awaiting: item.mediaType === 'video' || Boolean(item.fileName),
  })
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

/**
 * A browser cannot draw a TIFF, and most cannot draw a HEIC; a processed photo's
 * master does not exist until the worker is done. Either way the <img> fails, and
 * an icon is a more honest thumbnail than a broken-image glyph. Keyed by `src` at
 * the call site, so a new source gets a fresh chance.
 */
function PhotoThumb({ src }: { src: string }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) {
    return (
      <div className="w-16 h-12 rounded bg-muted flex items-center justify-center shrink-0">
        <ImageIcon size={20} className="text-muted-foreground" />
      </div>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" onError={() => setFailed(true)} className="w-16 h-12 object-cover rounded shrink-0" />
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
  // The thumbnail of a photo just uploaded is the file itself, held in the
  // browser. Once the worker is done the real thing exists, and that is what the
  // page will show — so the panel switches to it and the admin sees the result.
  const thumbSrc =
    item.mediaType === 'photo' && item.preview.startsWith('blob:') && job?.phase === 'done'
      ? photoUrl(item.storageKey)
      : item.preview

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

      {item.mediaType === 'photo' ? (
        <PhotoThumb key={thumbSrc} src={thumbSrc} />
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
            {item.mediaType === 'video' ? 'Video' : 'Photo'}
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
  getPresignedUploadUrl: (ownerId: string, fileName: string, contentType: string, type: 'photo') => Promise<{ url: string; key: string; contentType: string }>
  getVideoPresignedUploadUrl: (ownerId: string, fileName: string, contentType: string) => Promise<{ url: string; key: string }>
}) {
  const [items, setItems] = useState<MediaItem[]>(
    defaultItems.map((m) => ({
      id: m.storageKey,
      storageKey: m.storageKey,
      mediaType: m.mediaType,
      preview: m.mediaType === 'photo' ? photoUrl(m.storageKey) : '',
    }))
  )
  const [jobs, setJobs] = useState<Record<string, VideoJobStatus>>({})

  // What the worker processes: every video, and every photo uploaded through
  // the staging prefix. A photo that predates the worker has no status at all.
  // Strings, not arrays: an array literal would be a new object on every render
  // and restart the poll each time.
  const jobKeys = items
    .filter((i) => !i.upload && (i.mediaType === 'video' || isStagedPhotoKey(i.storageKey)))
    .map((i) => i.storageKey)
    .join('|')
  // Items that arrived in this session are worth waiting on even before the
  // worker has said anything; older ones simply never had a status.
  const freshKeys = items
    .filter((i) => !i.upload && i.fileName && (i.mediaType === 'video' || isStagedPhotoKey(i.storageKey)))
    .map((i) => i.storageKey)
    .join('|')

  useEffect(() => {
    const all = jobKeys ? jobKeys.split('|') : []
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
        statuses = await getMediaJobStatuses(keys)
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
  }, [jobKeys, freshKeys])

  // Once a job reports done with a sha256, record it — the only moment it's
  // known for a video, since the source is gone right after, and for a photo
  // the browser did not hash itself. Idempotent (recordMediaHashAction just
  // re-writes the same value), so a rare double call from two renders in
  // flight at once costs nothing.
  useEffect(() => {
    for (const item of items) {
      if (item.sha256 || item.upload) continue
      const job = jobs[item.storageKey]
      if (job?.phase !== 'done' || !job.sha256) continue
      const sha256 = job.sha256
      const storageKey = item.storageKey
      recordMediaHashAction(storageKey, sha256)
        .then(({ duplicate }) => {
          setItems((prev) => prev.map((i) => (i.storageKey === storageKey ? { ...i, sha256 } : i)))
          if (duplicate) toast.warning(`This ${item.mediaType} looks identical to one already uploaded elsewhere.`)
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

  const [pendingDuplicate, setPendingDuplicate] = useState<File | null>(null)

  const uploadFile = useCallback(async (file: File, opts?: { skipDuplicateCheck?: boolean }) => {
    // By extension too: a browser reports no type at all for some containers
    // (.mkv on several platforms), and a video mistaken for a photo would be
    // refused as an unsupported photo format.
    const isVideo = file.type.startsWith('video/') || VIDEO_EXTENSION.test(file.name)

    // A photo is hashed before a single byte moves, so an identical one can be
    // flagged while it costs nothing to stop. Hashing and the lookup are both a
    // courtesy: neither may ever be the reason a photo cannot be uploaded.
    let sha256: string | undefined
    if (!isVideo && file.size <= BROWSER_HASH_MAX_BYTES) {
      try {
        sha256 = await sha256HexOfFile(file)
      } catch (err) {
        console.error(err)
      }
      if (sha256 && !opts?.skipDuplicateCheck) {
        try {
          if ((await findDuplicateMediaAction(sha256)).duplicate) {
            setPendingDuplicate(file)
            return
          }
        } catch (err) {
          console.error(err)
        }
      }
    }

    // The key is known before a single byte moves, so the item can join the
    // list now and keep its identity all the way to "ready". It used to live in
    // a second list and be replaced on completion, which is what put a gap in
    // the middle of the journey.
    let key: string
    let url: string
    let contentType: string
    try {
      if (isVideo) {
        const result = await getVideoPresignedUploadUrl(effectiveOwnerId, file.name, file.type)
        key = result.key
        url = result.url
        contentType = file.type
      } else {
        const result = await getPresignedUploadUrl(effectiveOwnerId, file.name, file.type, 'photo')
        key = result.key
        url = result.url
        contentType = result.contentType
      }
    } catch (err) {
      console.error(err)
      toast.error(`Upload failed: ${file.name}`)
      return
    }

    // A TIFF or HEIC cannot be drawn by the browser: the thumbnail falls back to
    // an icon until the worker's result replaces it (see PhotoThumb).
    setItems((prev) => [...prev, {
      id: key,
      storageKey: key,
      mediaType: isVideo ? 'video' : 'photo',
      preview: isVideo ? '' : URL.createObjectURL(file),
      fileName: file.name,
      upload: { progress: 0 },
      sha256,
    }])

    const patch = (fields: Partial<MediaItem>) =>
      setItems((prev) => prev.map((i) => (i.storageKey === key ? { ...i, ...fields } : i)))

    try {
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('PUT', url)
        // Signed into the URL: it has to be exactly what the server chose.
        xhr.setRequestHeader('Content-Type', contentType)
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            patch({ upload: { progress: Math.round((e.loaded / e.total) * 100) } })
          }
        }
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve()
          else reject(new Error(`${xhr.status}`))
        }
        xhr.onerror = () => reject(new Error('Network error'))
        xhr.send(file)
      })

      // From here the bar belongs to the worker's status.
      patch({ upload: undefined })
    } catch (err) {
      console.error(err)
      toast.error(`Upload failed: ${file.name}`)
      patch({ upload: { progress: 0, failed: true } })
    }
  }, [effectiveOwnerId, getPresignedUploadUrl, getVideoPresignedUploadUrl])

  const onDrop = useCallback((acceptedFiles: File[]) => {
    for (const file of acceptedFiles) uploadFile(file)
  }, [uploadFile])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    // Exactly the formats the worker can decode, spelled out rather than as
    // `image/*`: what a wildcard means next to a list of extensions changed
    // between react-dropzone versions, and anything the worker cannot decode
    // would sit unprocessed forever. The extensions matter as much as the types:
    // Chrome on Windows reports no type at all for a HEIC file.
    accept: {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/webp': ['.webp'],
      'image/tiff': ['.tif', '.tiff'],
      'image/heic': ['.heic'],
      'image/heif': ['.heif'],
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
          <span>Add a photo or video (drag or click)</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">Photos: JPG, PNG, WebP, TIFF or HEIC</p>
        <p className="text-xs text-muted-foreground">After uploading, photos and videos are prepared for the site: this can take a few minutes</p>
      </div>

      <input type="hidden" name="mediaItems" value={mediaItemsJson} />

      <AlertDialog open={pendingDuplicate !== null} onOpenChange={(open) => !open && setPendingDuplicate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>File already uploaded</AlertDialogTitle>
            <AlertDialogDescription>
              This photo is identical to one already elsewhere on the site. Upload it anyway?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingDuplicate(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (!pendingDuplicate) return
              const file = pendingDuplicate
              setPendingDuplicate(null)
              uploadFile(file, { skipDuplicateCheck: true })
            }}>
              Upload anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
