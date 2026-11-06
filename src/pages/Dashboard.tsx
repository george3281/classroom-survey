import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Shell, StatusBadge } from '../components/ui'
import {
  activateSurvey, archiveSurvey, closeSurvey, deleteSurvey, duplicateSurvey, friendlyError, listSurveys,
  type SurveyListItem,
} from '../lib/api'

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

export default function Dashboard() {
  const navigate = useNavigate()
  const [surveys, setSurveys] = useState<SurveyListItem[] | null>(null)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [since, setSince] = useState('')

  const load = useCallback(() => listSurveys().then(setSurveys).catch((e) => setError(friendlyError(e))), [])
  useEffect(() => { load() }, [load])

  // Runs one mutation for a card, keeping its buttons disabled until it finishes.
  async function act(id: string, fn: () => Promise<unknown>, then?: (r: unknown) => void) {
    setBusyId(id)
    setError('')
    try {
      const r = await fn()
      if (then) then(r)
      else await load()
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setBusyId(null)
    }
  }

  const confirmDelete = (s: SurveyListItem) =>
    confirm(
      s.response_count > 0
        ? `Delete "${s.title}"?\n\nWARNING: this survey has ${s.response_count} response(s). Deleting permanently erases the survey AND all of its responses. Consider Archive instead.`
        : `Delete "${s.title}"?\n\nThis will permanently delete the survey and all of its responses.`,
    )

  const visible = (surveys ?? []).filter(
    (s) =>
      s.title.toLowerCase().includes(search.trim().toLowerCase()) &&
      (status === 'all' || s.status === status) &&
      (!since || s.created_at.slice(0, 10) >= since),
  )

  return (
    <Shell>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <Link to="/surveys/new" className="btn btn-primary">New Survey</Link>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="search" className="mb-1 block text-sm font-medium">Search</label>
          <input id="search" className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Survey title" />
        </div>
        <div>
          <label htmlFor="status" className="mb-1 block text-sm font-medium">Status</label>
          <select id="status" className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">All</option>
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="closed">Closed</option>
            <option value="archived">Archived</option>
          </select>
        </div>
        <div>
          <label htmlFor="since" className="mb-1 block text-sm font-medium">Created on or after</label>
          <input id="since" type="date" className="input" value={since} onChange={(e) => setSince(e.target.value)} />
        </div>
      </div>

      {error && <p role="alert" className="error mb-4">{error}</p>}

      {surveys === null ? (
        !error && <p>Loading surveys...</p>
      ) : surveys.length === 0 ? (
        <div className="card text-center">
          <p className="mb-4">You have not created any surveys yet.</p>
          <Link to="/surveys/new" className="btn btn-primary">Create Your First Survey</Link>
        </div>
      ) : visible.length === 0 ? (
        <p>No surveys match your search.</p>
      ) : (
        <ul className="space-y-4">
          {visible.map((s) => {
            const busy = busyId !== null
            return (
              <li key={s.id} className="card">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h2 className="text-lg font-semibold">{s.title}</h2>
                  <StatusBadge status={s.status} />
                </div>
                <p className="mt-1 text-sm text-slate-600">
                  Created: {fmtDate(s.created_at)} · {s.response_count} response{s.response_count === 1 ? '' : 's'}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {s.status === 'draft' && <Link className="btn" to={`/surveys/${s.id}/edit`}>Edit</Link>}
                  {s.status === 'active' && <Link className="btn btn-primary" to={`/surveys/${s.id}/present`}>Present</Link>}
                  {(s.status === 'draft' || s.status === 'closed') && (
                    <button className="btn btn-primary" disabled={busy}
                      onClick={() => act(s.id, () => activateSurvey(s.id), () => navigate(`/surveys/${s.id}/present`))}>
                      {s.status === 'closed' ? 'Reopen' : 'Activate'}
                    </button>
                  )}
                  {s.status === 'active' && (
                    <button className="btn" disabled={busy}
                      onClick={() => confirm(`Close "${s.title}"? Students will no longer be able to submit.`) && act(s.id, () => closeSurvey(s.id))}>
                      Close
                    </button>
                  )}
                  {s.status !== 'draft' && <Link className="btn" to={`/surveys/${s.id}/results`}>Results</Link>}
                  <button className="btn" disabled={busy}
                    onClick={() => act(s.id, () => duplicateSurvey(s.id), (newId) => navigate(`/surveys/${newId}/edit`))}>
                    Duplicate
                  </button>
                  {(s.status === 'draft' || s.status === 'closed') && (
                    <button className="btn" disabled={busy}
                      onClick={() => confirm(`Archive "${s.title}"? It will be read-only, but results are kept.`) && act(s.id, () => archiveSurvey(s.id))}>
                      Archive
                    </button>
                  )}
                  {s.status !== 'active' && (
                    <button className="btn btn-danger" disabled={busy} onClick={() => confirmDelete(s) && act(s.id, () => deleteSurvey(s.id))}>
                      Delete
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Shell>
  )
}
