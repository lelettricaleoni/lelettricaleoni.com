import { describe, it, expect } from 'vitest'
import { parseGpxStats, watermarkGpx } from './gpx'

const SAMPLE_GPX = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Test">
  <trk><trkseg>
    <trkpt lat="45.9589" lon="10.9042"><ele>65</ele></trkpt>
    <trkpt lat="45.9600" lon="10.9050"><ele>70</ele></trkpt>
    <trkpt lat="45.9650" lon="10.9100"><ele>60</ele></trkpt>
    <trkpt lat="45.9700" lon="10.9150"><ele>80</ele></trkpt>
  </trkseg></trk>
</gpx>`

describe('parseGpxStats', () => {
  it('returns distance and elevation gain', () => {
    const stats = parseGpxStats(SAMPLE_GPX)
    expect(stats.distanceKm).toBeGreaterThan(0)
    expect(stats.elevationM).toBeGreaterThan(0)
  })

  it('elevation gain ignores descents', () => {
    const stats = parseGpxStats(SAMPLE_GPX)
    // gains: +5 (65→70), +20 (60→80) = 25m, ignoring -10 (70→60)
    expect(stats.elevationM).toBe(25)
  })
})

describe('watermarkGpx', () => {
  it('injects Lelettrica metadata into GPX', () => {
    const result = watermarkGpx(SAMPLE_GPX, 'Lago di Garda nord')
    expect(result).toContain('Lelettrica')
    expect(result).toContain('Lago di Garda nord')
    expect(result).toContain('<metadata>')
  })

  it('preserves original trackpoints', () => {
    const result = watermarkGpx(SAMPLE_GPX, 'Test')
    expect(result).toContain('lat="45.9589"')
  })
})
