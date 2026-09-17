'use server'
import { eq, asc } from 'drizzle-orm'
import { db, bikeSizes, bikeVersions, bikeCategories } from '@/lib/db'
import { getAdminUser } from '@/lib/supabase/server'
import { updateTag } from 'next/cache'

async function requireAdmin() {
  const user = await getAdminUser()
  if (!user) throw new Error('Unauthorized')
}

// --- Sizes -------------------------------------------------------------

export async function listBikeSizes() {
  await requireAdmin()
  return db.select().from(bikeSizes).orderBy(asc(bikeSizes.displayOrder))
}

export async function createBikeSizeAction(name: string, displayOrder: number) {
  await requireAdmin()
  await db.insert(bikeSizes).values({ name, displayOrder })
  updateTag('bike-options')
}

export async function updateBikeSizeAction(id: string, name: string, displayOrder: number) {
  await requireAdmin()
  await db.update(bikeSizes).set({ name, displayOrder }).where(eq(bikeSizes.id, id))
  updateTag('bike-options')
}

export async function deleteBikeSizeAction(id: string) {
  await requireAdmin()
  // Relies on the database rejecting this when a bike_model_sizes or
  // bike_units row still references it (no onDelete cascade on that FK,
  // see the bike model / bike unit schema) — surfaced to the caller as a
  // thrown error, not silently swallowed, so the UI can show why the
  // delete failed.
  await db.delete(bikeSizes).where(eq(bikeSizes.id, id))
  updateTag('bike-options')
}

// --- Versions ------------------------------------------------------------

export async function listBikeVersions() {
  await requireAdmin()
  return db.select().from(bikeVersions).orderBy(asc(bikeVersions.displayOrder))
}

export async function createBikeVersionAction(name: string, displayOrder: number) {
  await requireAdmin()
  await db.insert(bikeVersions).values({ name, displayOrder })
  updateTag('bike-options')
}

export async function updateBikeVersionAction(id: string, name: string, displayOrder: number) {
  await requireAdmin()
  await db.update(bikeVersions).set({ name, displayOrder }).where(eq(bikeVersions.id, id))
  updateTag('bike-options')
}

export async function deleteBikeVersionAction(id: string) {
  await requireAdmin()
  await db.delete(bikeVersions).where(eq(bikeVersions.id, id))
  updateTag('bike-options')
}

// --- Categories ------------------------------------------------------------

export interface BikeCategoryInput {
  name: string
  displayOrder: number
  maxRentalDays: number
  pricingMode: 'table' | 'linear'
  day1Price: string
  day2Price?: string | null
  day3Price?: string | null
  day4Price?: string | null
  day5Price?: string | null
  day6Price?: string | null
  day7Price?: string | null
  perDayAfterPrice?: string | null
  afternoonPrice?: string | null
}

export async function listBikeCategories() {
  await requireAdmin()
  return db.select().from(bikeCategories).orderBy(asc(bikeCategories.displayOrder))
}

export async function createBikeCategoryAction(input: BikeCategoryInput) {
  await requireAdmin()
  await db.insert(bikeCategories).values(input)
  updateTag('bike-options')
}

export async function updateBikeCategoryAction(id: string, input: BikeCategoryInput) {
  await requireAdmin()
  await db.update(bikeCategories).set(input).where(eq(bikeCategories.id, id))
  updateTag('bike-options')
  updateTag('bike-models') // model list shows each model's effective price
}

export async function deleteBikeCategoryAction(id: string) {
  await requireAdmin()
  await db.delete(bikeCategories).where(eq(bikeCategories.id, id))
  updateTag('bike-options')
}
