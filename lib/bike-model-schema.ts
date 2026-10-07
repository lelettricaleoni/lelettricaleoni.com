import { z } from 'zod'
import { TRANSLATION_MAX_CHARS } from '@/lib/translate-text'

/**
 * A bike model's form. Its own module because lib/actions/bike-models.ts is a
 * Server Action file, which may export nothing but async functions.
 *
 * The description is capped at what the translator accepts, here, where the form
 * can show the message next to the field: it used to be found out by the
 * translation call after the model row was already written.
 */
export const BikeModelSchema = z.object({
  nameIt:          z.string().min(2).max(200),
  descriptionIt:   z.string().min(10).max(
    TRANSLATION_MAX_CHARS,
    `The description is too long: ${TRANSLATION_MAX_CHARS} characters at most (it is translated to English and German).`
  ),
  categoryId:      z.string().uuid(),
  priceSurcharge:  z.coerce.number().nonnegative().optional(),
  batteryRange:    z.string().optional(),
  motor:           z.string().optional(),
  gearCount:       z.string().optional(),
  sizeIds:         z.array(z.string().uuid()).min(1, 'Select at least one size'),
  versionIds:      z.array(z.string().uuid()).min(1, 'Select at least one version'),
})

export type BikeModelInput = z.infer<typeof BikeModelSchema>
