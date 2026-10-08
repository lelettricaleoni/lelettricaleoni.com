'use client'
import { useState, useTransition } from 'react'
import { LuDownload } from 'react-icons/lu'
import { Button } from '@/components/ui/button'
import { exportAccountDataAction } from '@/lib/actions/account'

/** Asks the server for a copy of the person's data and saves it as a file in the browser. */
export function ExportDataButton({ label, failed }: { label: string; failed: string }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState(false)

  const download = () => {
    setError(false)
    startTransition(async () => {
      const result = await exportAccountDataAction()
      if ('error' in result) {
        setError(true)
        return
      }
      const url = URL.createObjectURL(new Blob([result.json], { type: 'application/json' }))
      const link = document.createElement('a')
      link.href = url
      link.download = result.filename
      link.click()
      URL.revokeObjectURL(url)
    })
  }

  return (
    <div className="space-y-2">
      <Button type="button" variant="outline" onClick={download} disabled={pending}>
        <LuDownload />
        {label}
      </Button>
      {error && <p role="alert" className="text-sm text-red-700">{failed}</p>}
    </div>
  )
}
