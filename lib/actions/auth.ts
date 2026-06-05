'use server'

import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '')

export async function loginAction(formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const lang = (formData.get('lang') as string) || 'it'

  const supabase = await createSupabaseServerClient()
  const { error, data: { user } } = await supabase.auth.signInWithPassword({ email, password })

  if (error) redirect(`/${lang}/login?error=Credenziali+non+valide.+Riprova.`)
  if (user?.app_metadata?.role === 'admin') redirect('/manage/routes')
  redirect(`/${lang}/login?error=Accesso+non+autorizzato.`)
}

export async function magicLinkAction(formData: FormData) {
  const email = formData.get('email') as string
  const lang = (formData.get('lang') as string) || 'it'

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${SITE_URL}/auth/callback` },
  })

  if (error) redirect(`/${lang}/login?error=${encodeURIComponent(error.message)}`)
  redirect(`/${lang}/login?info=magic_link_sent`)
}

export async function resetPasswordAction(formData: FormData) {
  const email = formData.get('email') as string
  const lang = (formData.get('lang') as string) || 'it'

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${SITE_URL}/auth/callback?next=/it/update-password`,
  })

  if (error) redirect(`/${lang}/login?error=${encodeURIComponent(error.message)}`)
  redirect(`/${lang}/login?info=reset_sent`)
}

export async function updatePasswordAction(formData: FormData) {
  const password = formData.get('password') as string

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.updateUser({ password })

  const lang = (formData.get('lang') as string) || 'it'
  if (error) redirect(`/${lang}/update-password?error=${encodeURIComponent(error.message)}`)
  redirect('/manage/routes')
}

export async function logoutAction() {
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut()
  redirect('/it/login')
}
