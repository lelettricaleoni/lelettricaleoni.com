import { describe, it, expect } from 'vitest'
import { mediaProgress } from './media-progress'
import type { VideoJobStatus } from './video-jobs'

const job = (phase: VideoJobStatus['phase'], extra: Partial<VideoJobStatus> = {}): VideoJobStatus =>
  ({ phase, updatedAt: 0, ...extra })

describe('mediaProgress — foto', () => {
  it('usa tutta la barra per il caricamento', () => {
    expect(mediaProgress('photo', { progress: 40 })?.percent).toBe(40)
  })

  it('sparisce una volta caricata: non c’è altro da aspettare', () => {
    expect(mediaProgress('photo', undefined)).toBeNull()
  })
})

describe('mediaProgress — video', () => {
  it('il caricamento riempie la prima metà', () => {
    expect(mediaProgress('video', { progress: 0 })?.percent).toBe(0)
    expect(mediaProgress('video', { progress: 50 })?.percent).toBe(25)
    expect(mediaProgress('video', { progress: 100 })?.percent).toBe(50)
  })

  it('copre l’attesa fra il caricamento e il worker', () => {
    // Il buco che rendeva il lavoro apparentemente fermo.
    const p = mediaProgress('video', undefined, undefined)
    expect(p).toMatchObject({ percent: 50, tone: 'working', active: true })
    expect(p!.label).toContain('attesa')
  })

  it('l’elaborazione riempie la seconda metà', () => {
    expect(mediaProgress('video', undefined, job('transcoding', { progress: 0 }))?.percent).toBe(50)
    expect(mediaProgress('video', undefined, job('transcoding', { progress: 50 }))?.percent).toBe(75)
    expect(mediaProgress('video', undefined, job('transcoding', { progress: 100 }))?.percent).toBe(100)
  })

  it('non torna mai indietro lungo tutto il percorso', () => {
    const sequence = [
      mediaProgress('video', { progress: 10 }),
      mediaProgress('video', { progress: 100 }),
      mediaProgress('video', undefined, undefined),
      mediaProgress('video', undefined, job('queued')),
      mediaProgress('video', undefined, job('downloading')),
      mediaProgress('video', undefined, job('transcoding', { progress: 30 })),
      mediaProgress('video', undefined, job('transcoding', { progress: 90 })),
      mediaProgress('video', undefined, job('uploading')),
      mediaProgress('video', undefined, job('done')),
    ].map((p) => p!.percent)

    for (let i = 1; i < sequence.length; i++) {
      expect(sequence[i]).toBeGreaterThanOrEqual(sequence[i - 1])
    }
    expect(sequence.at(-1)).toBe(100)
  })

  it('mostra la percentuale reale, non quella della barra', () => {
    expect(mediaProgress('video', { progress: 40 })!.label).toBe('Caricamento 40%')
    expect(mediaProgress('video', undefined, job('transcoding', { progress: 40 }))!.label)
      .toBe('Elaborazione 40%')
  })
})

describe('mediaProgress — esiti', () => {
  it('un caricamento fallito si ferma e si vede', () => {
    expect(mediaProgress('video', { progress: 30, failed: true })).toMatchObject({
      tone: 'error', active: false,
    })
  })

  it('una transcodifica fallita porta con sé il motivo', () => {
    const p = mediaProgress('video', undefined, job('failed', { error: 'ffmpeg è esploso', attempt: 3 }))
    expect(p).toMatchObject({ tone: 'error', active: false, detail: 'ffmpeg è esploso' })
  })

  it('smette di essere attivo quando è pronto', () => {
    expect(mediaProgress('video', undefined, job('done'))).toMatchObject({
      percent: 100, tone: 'ready', active: false,
    })
  })

  it('segnala i tentativi successivi al primo', () => {
    expect(mediaProgress('video', undefined, job('transcoding', { progress: 10, attempt: 2 }))?.detail)
      .toBe('tentativo 2')
    expect(mediaProgress('video', undefined, job('transcoding', { progress: 10, attempt: 1 }))?.detail)
      .toBeUndefined()
  })
})
