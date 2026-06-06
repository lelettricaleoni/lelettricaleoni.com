'use client'
import { useState, useCallback, useRef } from 'react'
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

export interface MediaItem {
  id: string
  storageKey: string
  mediaType: 'photo' | 'video'
  preview: string
}

interface UploadingItem {
  id: string
  name: string
  mediaType: 'photo' | 'video'
  progress: number
}

function SortableItem({
  item,
  onRemove,
}: {
  item: MediaItem
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
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${item.mediaType === 'video' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
          {item.mediaType === 'video' ? 'Video' : 'Foto'}
        </span>
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
