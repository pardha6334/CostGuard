// src/app/(dashboard)/layout.tsx
// CostGuard — Dashboard shell: auth guard + Sidebar + Topbar
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Sidebar from '@/components/layout/Sidebar'
import Topbar from '@/components/layout/Topbar'
import { DevToolbar } from '@/components/dev/DevToolbar'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Only check auth when Supabase is properly configured
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (supabaseUrl && supabaseUrl !== 'REPLACE_ME') {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) redirect('/login')
    } catch {
      redirect('/login')
    }
  }

  return (
    <div style={{ background: 'var(--void)', minHeight: '100vh' }}>
      <Sidebar />
      <div style={{ marginLeft: '64px', display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <Topbar />
        <main style={{ flex: 1, padding: '24px 32px', background: 'var(--void)', color: 'var(--text)' }}>
          {children}
        </main>
      </div>
      {process.env.NODE_ENV === 'development' && <DevToolbar />}
    </div>
  )
}
