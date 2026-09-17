'use client'
import { useTransition } from 'react'
import Link from 'next/link'
import { Pencil, Trash2, Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { deleteBikeModelAction, togglePublishBikeModelAction } from '@/lib/actions/bike-models'
import type { BikeModel } from '@/lib/db'

export function BikeModelListItem({ model, name }: { model: BikeModel; name: string }) {
  const [isPending, startTransition] = useTransition()

  function handleDelete() {
    startTransition(async () => {
      try {
        await deleteBikeModelAction(model.id)
        toast.success('Model deleted')
      } catch {
        toast.error('This model still has bikes in the shop — remove those first')
      }
    })
  }

  function handleTogglePublish() {
    startTransition(async () => {
      await togglePublishBikeModelAction(model.id, !model.isPublished)
      toast.success(model.isPublished ? 'Model hidden' : 'Model published')
    })
  }

  return (
    <div className="flex items-center justify-between p-4 bg-card border rounded-lg">
      <div className="space-y-1 min-w-0">
        <p className="font-medium text-[#1e3a5f] truncate">{name}</p>
        <Badge variant={model.isPublished ? 'default' : 'secondary'}>
          {model.isPublished ? 'Published' : 'Draft'}
        </Badge>
      </div>

      <div className="flex items-center gap-2 shrink-0 ml-4">
        <Button variant="ghost" size="icon" onClick={handleTogglePublish} disabled={isPending} title={model.isPublished ? 'Hide' : 'Publish'}>
          {model.isPublished ? <EyeOff size={16} /> : <Eye size={16} />}
        </Button>

        <Button variant="ghost" size="icon" asChild>
          <Link href={`/manage/bikes/${model.id}`}><Pencil size={16} /></Link>
        </Button>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
              <Trash2 size={16} />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete model?</AlertDialogTitle>
              <AlertDialogDescription>
                This action is irreversible. All photos and videos for this model will also
                be deleted. Blocked if any physical bike in the shop still uses this model.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}
