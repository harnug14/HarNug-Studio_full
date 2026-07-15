'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/')
      router.refresh()
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-black">
      <form onSubmit={handleLogin} className="w-full max-w-sm space-y-4 rounded-lg border border-gray-800 p-8">
        <h1 className="text-2xl font-bold text-white">AI Creator Studio</h1>
        <input type="email" placeholder="Email" value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded border border-gray-700 bg-gray-900 p-2 text-white" required />
        <input type="password" placeholder="Password" value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded border border-gray-700 bg-gray-900 p-2 text-white" required />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button type="submit" disabled={loading}
          className="w-full rounded bg-white p-2 font-semibold text-black">
          {loading ? 'Loading...' : 'Login'}
        </button>
      </form>
    </div>
  )
}