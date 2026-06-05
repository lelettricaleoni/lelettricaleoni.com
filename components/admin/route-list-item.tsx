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
import { deleteRouteAction, togglePublishAction } from '@/lib/actions/routes'
import { DifficultyBadge } from '@/components/difficulty-badge'
import type { Route } from '@/lib/db'

const DIFFICULTY_LABELS: Record<string, string> = {
  easy: 'Easy', medium: 'Medium', hard: 'Hard', expert: 'Expert',
}

export function RouteListItem({ route, name }: { route: Route; name: string }) {
  const [isPending, startTransition] = useTransition()

  function handleDelete() {
    startTransition(async () => {
      await deleteRouteAction(route.id)
      toast.success('Route deleted')
    })
  }

  function handleTogglePublish() {
    startTransition(async () => {
      await togglePublishAction(route.id, !route.isPublished)
      toast.success(route.isPublished ? 'Route hidden' : 'Route published')
    })
  }

  return (
    <div className="flex items-center justify-between p-4 bg-card border rounded-lg">
      <div className="space-y-1 min-w-0">
        <p className="font-medium text-[#1e3a5f] truncate">{name}</p>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <DifficultyBadge difficulty={route.difficulty} label={DIFFICULTY_LABELS[route.difficulty] ?? route.difficulty} />
          {route.distanceKm && <span>{route.distanceKm} km</span>}
          <Badge variant={route.isPublished ? 'default' : 'secondary'}>
            {route.isPublished ? 'Published' : 'Draft'}
          </Badge>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0 ml-4">
        <Button
          variant="ghost" size="icon"
          onClick={handleTogglePublish}
          disabled={isPending}
          title={route.isPublished ? 'Hide' : 'Publish'}
        >
          {route.isPublished ? <EyeOff size={16} /> : <Eye size={16} />}
        </Button>

        <Button variant="ghost" size="icon" asChild>
          <Link href={`/manage/routes/${route.id}`}><Pencil size={16} /></Link>
        </Button>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
              <Trash2 size={16} />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete route?</AlertDialogTitle>
              <AlertDialogDescription>
                This action is irreversible. All photos and the GPX file will also be deleted.
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
