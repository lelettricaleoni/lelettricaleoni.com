'use server'

interface TranslationResult {
  en: string
  de: string
}

export async function translateFromItalian(text: string): Promise<TranslationResult> {
  const endpoint = process.env.AZURE_TRANSLATOR_ENDPOINT!
  const key = process.env.AZURE_TRANSLATOR_KEY!
  const region = process.env.AZURE_TRANSLATOR_REGION!

  const response = await fetch(
    `${endpoint}/translate?api-version=3.0&from=it&to=en&to=de`,
    {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': key,
        'Ocp-Apim-Subscription-Region': region,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([{ text }]),
    }
  )

  if (!response.ok) {
    throw new Error(`Azure Translator error: ${response.status}`)
  }

  const data = await response.json()
  const translations: { to: string; text: string }[] = data[0]?.translations ?? []
  const en = translations.find((t) => t.to === 'en')?.text ?? text
  const de = translations.find((t) => t.to === 'de')?.text ?? text
  return { en, de }
}
