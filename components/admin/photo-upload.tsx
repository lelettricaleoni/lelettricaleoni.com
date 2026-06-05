'use client'
import { useState, useCallback } from 'react'
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
import { GripVertical, X, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { r2PublicUrl } from '@/lib/r2'
import { getPresignedUploadUrlAction } from '@/lib/actions/routes'

interface Photo { storageKey: string; preview: string }

function SortablePhoto({ photo, onRemove }: { photo: Photo; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: photo.storageKey })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="flex items-center gap-3 bg-card border rounded-lg p-2"
    >
      <button type="button" {...attributes} {...listeners} className="text-muted-foreground hover:text-foreground cursor-grab">
        <GripVertical size={16} />
      </button>
      <img src={photo.preview} alt="" className="w-16 h-12 object-cover rounded" />
      <span className="text-xs text-muted-foreground flex-1 truncate">{photo.storageKey.split('/').pop()}</span>
      <button type="button" onClick={onRemove} className="text-destructive hover:text-destructive/80 cursor-pointer">
        <X size={14} />
      </button>
    </div>
  )
}

export function PhotoUpload({
  routeId,
  defaultPhotos = [],
}: {
  routeId: string
  defaultPhotos?: { storageKey: string }[]
}) {
  const [photos, setPhotos] = useState<Photo[]>(
    defaultPhotos.map((p) => ({ storageKey: p.storageKey, preview: r2PublicUrl(p.storageKey) }))
  )
  const [uploading, setUploading] = useState(false)
  const effectiveRouteId = routeId === 'new' ? (() => {
    if (typeof window === 'undefined') return 'new'
    const k = '__gpx_tmp_id'
    if (!sessionStorage.getItem(k)) sessionStorage.setItem(k, crypto.randomUUID())
    return sessionStorage.getItem(k)!
  })() : routeId

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    setUploading(true)
    try {
      const newPhotos: Photo[] = []
      for (const file of acceptedFiles) {
        const { key } = await getPresignedUploadUrlAction(effectiveRouteId, file.name, file.type, 'photo')
        const fd = new FormData()
        fd.append('file', file)
        fd.append('key', key)
        const uploadRes = await fetch('/api/upload', { method: 'POST', body: fd })
        if (!uploadRes.ok) throw new Error(`Upload ${uploadRes.status}: ${await uploadRes.text()}`)
        newPhotos.push({ storageKey: key, preview: URL.createObjectURL(file) })
      }
      setPhotos((prev) => [...prev, ...newPhotos])
      toast.success(`${newPhotos.length} photo${newPhotos.length !== 1 ? 's' : ''} uploaded`)
    } catch {
      toast.error('Photo upload failed')
    } finally {
      setUploading(false)
    }
  }, [routeId])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'image/*': ['.jpg', '.jpeg', '.webp', '.png'] },
    onDrop,
  })

  function handleDragEnd(event: { active: { id: string }; over: { id: string } | null }) {
    const { active, over } = event
    if (over && active.id !== over.id) {
      setPhotos((items) => {
        const oldIndex = items.findIndex((i) => i.storageKey === active.id)
        const newIndex = items.findIndex((i) => i.storageKey === over.id)
        return arrayMove(items, oldIndex, newIndex)
      })
    }
  }

  return (
    <div className="space-y-3">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd as Parameters<typeof DndContext>[0]['onDragEnd']}>
        <SortableContext items={photos.map((p) => p.storageKey)} strategy={verticalListSortingStrategy}>
          {photos.map((photo) => (
            <SortablePhoto
              key={photo.storageKey}
              photo={photo}
              onRemove={() => setPhotos((prev) => prev.filter((p) => p.storageKey !== photo.storageKey))}
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
          {uploading ? 'Uploading...' : 'Add photos (drop or click)'}
        </div>
      </div>

      {photos.map((p) => (
        <input key={p.storageKey} type="hidden" name="photoKey" value={p.storageKey} />
      ))}
    </div>
  )
}
