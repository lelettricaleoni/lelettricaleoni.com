'use client'
import { useState, useRef, useCallback } from 'react'

export type DownloadStatus = 'idle' | 'downloading' | 'done' | 'error'

export type DownloadState = {
  status: DownloadStatus
  progress: number        // 0-100
  bytesLoaded: number
  bytesTotal: number
  timeRemainingS: number | null
  error: string | null
}

const IDLE: DownloadState = {
  status: 'idle',
  progress: 0,
  bytesLoaded: 0,
  bytesTotal: 0,
  timeRemainingS: null,
  error: null,
}

export function useFileDownload() {
  const [state, setState] = useState<DownloadState>(IDLE)
  const startRef = useRef<number>(0)

  const download = useCallback(async (url: string, filename: string) => {
    setState({ ...IDLE, status: 'downloading' })
    startRef.current = Date.now()

    try {
      const response = await fetch(url)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)

      const total = Number(response.headers.get('Content-Length') ?? 0)
      const reader = response.body!.getReader()
      const chunks: Uint8Array[] = []
      let loaded = 0

      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
        loaded += value.length

        const elapsed = (Date.now() - startRef.current) / 1000
        const speed = elapsed > 0 ? loaded / elapsed : 0
        const remaining = total > 0 && speed > 0 ? Math.ceil((total - loaded) / speed) : null

        setState({
          status: 'downloading',
          progress: total > 0 ? Math.min(99, Math.round((loaded / total) * 100)) : 0,
          bytesLoaded: loaded,
          bytesTotal: total,
          timeRemainingS: remaining,
          error: null,
        })
      }

      const blob = new Blob(chunks as BlobPart[])
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(blobUrl), 5000)

      setState({ ...IDLE, status: 'done', progress: 100, bytesLoaded: loaded, bytesTotal: total })
    } catch (err) {
      setState({ ...IDLE, status: 'error', error: err instanceof Error ? err.message : String(err) })
    }
  }, [])

  const reset = useCallback(() => setState(IDLE), [])

  return { ...state, download, reset }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function formatTimeRemaining(seconds: number): string {
  if (seconds < 5) return '< 5s'
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}
