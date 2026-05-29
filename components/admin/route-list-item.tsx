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
import type { Route } from '@/lib/db'

const difficultyLabel: Record<string, string> = {
  easy: 'Facile', medium: 'Medio', hard: 'Difficile', expert: 'Esperto'
}

export function RouteListItem({ route, name }: { route: Route; name: string }) {
  const [isPending, startTransition] = useTransition()

  function handleDelete() {
    startTransition(async () => {
      await deleteRouteAction(route.id)
      toast.success('Percorso eliminato')
    })
  }

  function handleTogglePublish() {
    startTransition(async () => {
      await togglePublishAction(route.id, !route.isPublished)
      toast.success(route.isPublished ? 'Percorso nascosto' : 'Percorso pubblicato')
    })
  }

  return (
    <div className="flex items-center justify-between p-4 bg-card border rounded-lg">
      <div className="space-y-1 min-w-0">
        <p className="font-medium text-[#1e3a5f] truncate">{name}</p>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Badge variant="outline">{difficultyLabel[route.difficulty]}</Badge>
          {route.distanceKm && <span>{route.distanceKm} km</span>}
          <Badge variant={route.isPublished ? 'default' : 'secondary'}>
            {route.isPublished ? 'Pubblicato' : 'Bozza'}
          </Badge>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0 ml-4">
        <Button
          variant="ghost" size="icon"
          onClick={handleTogglePublish}
          disabled={isPending}
          title={route.isPublished ? 'Nascondi' : 'Pubblica'}
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
              <AlertDialogTitle>Eliminare il percorso?</AlertDialogTitle>
              <AlertDialogDescription>
                Questa azione è irreversibile. Verranno eliminate anche tutte le foto e il file GPX.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annulla</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
                Elimina
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}
