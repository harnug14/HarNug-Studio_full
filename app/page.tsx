import { createSupabaseServerClient } from '@/lib/supabaseServer'
import { redirect } from 'next/navigation'
import LogoutButton from './components/LogoutButton'

export default async function Home() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="min-h-screen bg-black p-8 text-white">
      <div className="flex items-center justify-between border-b border-gray-800 pb-4">
        <h1 className="text-2xl font-bold">AI Creator Studio</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-400">{user.email}</span>
          <LogoutButton />
        </div>
      </div>
      <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3">
        {['Profile', 'Referensi', 'Topik', 'Naskah', 'Visual', 'AI Chat'].map((menu) => (
          <div key={menu} className="rounded-lg border border-gray-800 p-6 text-center hover:border-gray-600">
            {menu}
          </div>
        ))}
      </div>
    </div>
  )
}