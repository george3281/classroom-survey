import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { Status } from '../lib/results'

const BADGE: Record<Status, string> = {
  draft: 'bg-slate-100 text-slate-800 border-slate-300',
  active: 'bg-green-100 text-green-900 border-green-400',
  closed: 'bg-amber-100 text-amber-900 border-amber-400',
  archived: 'bg-slate-200 text-slate-700 border-slate-400',
}

// The text label carries the meaning; color is only a secondary cue.
export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`inline-block rounded-full border px-2.5 py-0.5 text-sm font-semibold ${BADGE[status]}`}>
      {status[0].toUpperCase() + status.slice(1)}
    </span>
  )
}

export function Shell({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link to="/dashboard" className="text-lg font-bold">Classroom Survey</Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-600 sm:inline">{session?.user.email}</span>
            <button className="btn" onClick={() => supabase.auth.signOut()}>Logout</button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  )
}
