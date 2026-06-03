import { loginAction } from '@/lib/actions/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const params = await searchParams

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 p-8 border rounded-lg shadow-sm">
        <div className="text-center">
          <h1 className="text-xl font-bold text-[#1e3a5f]">Lelettrica — Manage</h1>
          <p className="text-sm text-muted-foreground mt-1">Restricted access</p>
        </div>

        {params.error && (
          <div className="p-3 bg-red-50 text-red-700 rounded text-sm border border-red-200">
            {params.error}
          </div>
        )}

        <form action={loginAction} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required autoComplete="email" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
            />
          </div>
          <Button type="submit" className="w-full bg-[#1e3a5f] hover:bg-[#152c4a]">
            Log in
          </Button>
        </form>
      </div>
    </div>
  )
}
