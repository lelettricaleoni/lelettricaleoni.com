'use server'

import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function loginAction(formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    redirect('/gestione/login?error=Credenziali+non+valide.+Riprova.')
  }

  redirect('/gestione/percorsi')
}

export async function logoutAction() {
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut()
  redirect('/gestione/login')
}
