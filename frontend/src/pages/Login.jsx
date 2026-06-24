import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function Login() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)

  const { login } = useAuth()
  const navigate  = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await login(email, password)
      navigate('/dashboard')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const autofill = (e, p) => {
    setEmail(e)
    setPassword(p)
    setError(null)
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Main card */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 shadow-sm">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-slate-900">DeskPulse</h1>
            <p className="text-slate-500 text-sm mt-1">Operations Intelligence</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="bg-white border border-slate-300 rounded-lg px-3 py-2 w-full text-sm text-slate-900 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none"
                placeholder="you@deskpulse.io"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="bg-white border border-slate-300 rounded-lg px-3 py-2 w-full text-sm text-slate-900 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="bg-sky-500 hover:bg-sky-600 text-white font-medium py-2 px-4 rounded-lg w-full transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="animate-spin inline-block h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                  Signing in...
                </>
              ) : (
                'Sign in'
              )}
            </button>
          </form>
        </div>

        {/* Demo credentials box */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 w-full mt-4">
          <p className="text-sm font-semibold text-amber-800 mb-2">Demo Credentials</p>
          <div className="space-y-1.5">
            <button
              type="button"
              onClick={() => autofill('admin@deskpulse.io', 'demo1234')}
              className="w-full text-left text-sm text-amber-700 hover:text-amber-900 font-mono py-0.5 hover:underline"
            >
              Super Admin: admin@deskpulse.io / demo1234
            </button>
            <button
              type="button"
              onClick={() => autofill('staff.bandrawest@deskpulse.io', 'demo1234')}
              className="w-full text-left text-sm text-amber-700 hover:text-amber-900 font-mono py-0.5 hover:underline"
            >
              Frontdesk (Bandra West): staff.bandrawest@deskpulse.io / demo1234
            </button>
          </div>
          <p className="text-xs text-amber-600 mt-2">Click any credential to auto-fill</p>
        </div>
      </div>
    </div>
  )
}
