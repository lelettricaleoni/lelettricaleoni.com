import type { VideoJobStatus } from './video-jobs'

/**
 * One progress bar for the whole life of a medium, from the file leaving the
 * browser to the video being playable.
 *
 * Two things used to be shown separately and did not know about each other: the
 * upload, and the transcoding the worker reports. Between them sat a gap — the
 * file was on R2 but the worker had not listed the bucket yet — where the work
 * appeared to stop. Here that gap is a phase like any other.
 *
 * The bar never goes backwards. Its halves are not a claim about how long each
 * stage takes: uploading fills the first, transcoding the second, and inside
 * each half the number shown is the real one that stage reports.
 */

export interface UploadState {
  /** 0-100, from the browser's own upload progress. */
  progress: number
  failed?: boolean
}

export type ProgressTone = 'working' | 'ready' | 'error'

export interface MediaProgress {
  /** 0-100 across the whole journey. */
  percent: number
  label: string
  tone: ProgressTone
  /** Details worth surfacing on hover, such as why it failed. */
  detail?: string
  /** False once there is nothing left to wait for. */
  active: boolean
}

const PHASE_LABELS: Record<VideoJobStatus['phase'], string> = {
  queued: 'In coda',
  downloading: 'Scaricamento',
  transcoding: 'Elaborazione',
  uploading: 'Salvataggio',
  done: 'Pronto',
  failed: 'Non riuscito',
}

/** A photo is done when it has been uploaded; a video has only got halfway. */
const UPLOAD_SHARE = 50

export function mediaProgress(
  mediaType: 'photo' | 'video',
  upload?: UploadState,
  job?: VideoJobStatus
): MediaProgress | null {
  if (upload?.failed) {
    return { percent: 100, label: 'Caricamento non riuscito', tone: 'error', active: false }
  }

  if (upload) {
    const share = mediaType === 'video' ? UPLOAD_SHARE / 100 : 1
    return {
      percent: Math.round(upload.progress * share),
      label: `Caricamento ${upload.progress}%`,
      tone: 'working',
      active: true,
    }
  }

  // Photos need nothing after the upload, so they stop having a progress bar.
  if (mediaType === 'photo') return null

  if (!job) {
    // The file is on R2 and the worker finds it by listing the bucket, so this
    // wait is expected and finite. Saying nothing here is what made the work
    // look stalled.
    return {
      percent: UPLOAD_SHARE,
      label: 'In attesa dell’elaborazione',
      tone: 'working',
      active: true,
    }
  }

  if (job.phase === 'failed') {
    return {
      percent: 100,
      label: PHASE_LABELS.failed,
      tone: 'error',
      detail: job.error,
      active: false,
    }
  }

  if (job.phase === 'done') {
    return { percent: 100, label: PHASE_LABELS.done, tone: 'ready', active: false }
  }

  // The remaining half belongs to transcoding, which is the only phase that
  // reports a real number; the others sit at its edges.
  const within =
    job.phase === 'transcoding' ? (job.progress ?? 0)
    : job.phase === 'uploading' ? 95
    : 2

  const label =
    job.phase === 'transcoding'
      ? `${PHASE_LABELS.transcoding} ${job.progress ?? 0}%`
      : PHASE_LABELS[job.phase]

  return {
    percent: UPLOAD_SHARE + Math.round((within * (100 - UPLOAD_SHARE)) / 100),
    label,
    tone: 'working',
    detail: job.attempt && job.attempt > 1 ? `tentativo ${job.attempt}` : undefined,
    active: true,
  }
}
