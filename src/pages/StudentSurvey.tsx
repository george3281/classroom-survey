import { useEffect, useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { friendlyError, getActiveSurveyBySlug, submitResponse, surveyStatusBySlug } from '../lib/api'
import type { SurveyWithQuestions } from '../lib/results'

type View = 'loading' | 'form' | 'done' | 'already' | 'closed' | 'notfound'

// localStorage can throw (private mode, blocked storage); fall back to memory so submitting still works.
const memory = new Map<string, string>()
const store = {
  get: (k: string) => { try { return localStorage.getItem(k) } catch { return memory.get(k) ?? null } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { memory.set(k, v) } },
}

function browserToken() {
  let t = store.get('survey_token')
  if (!t) store.set('survey_token', (t = crypto.randomUUID()))
  return t
}

const MESSAGES: Partial<Record<View, string>> = {
  already: 'You have already submitted a response to this survey.',
  closed: 'This survey is no longer accepting responses.',
  notfound: 'Survey not found.',
}

export default function StudentSurvey() {
  const { slug = '' } = useParams()
  const [survey, setSurvey] = useState<SurveyWithQuestions | null>(null)
  const [view, setView] = useState<View>('loading')
  const [picked, setPicked] = useState<Record<string, string>>({})
  const [showMissing, setShowMissing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getActiveSurveyBySlug(slug)
      .then(async (s) => {
        if (s) {
          setSurvey(s)
          return setView(store.get(`submitted:${s.id}`) ? 'already' : 'form')
        }
        setView((await surveyStatusBySlug(slug)) ? 'closed' : 'notfound')
      })
      .catch((e) => { setError(friendlyError(e)); setView('form') })
  }, [slug])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!survey) return
    if (survey.questions.some((q) => !picked[q.id])) {
      setShowMissing(true)
      return setError('Please answer every question before submitting.')
    }
    setSubmitting(true)
    setError('')
    try {
      await submitResponse(survey.id, browserToken(), survey.questions.map((q) => ({ question_id: q.id, choice_id: picked[q.id] })))
      store.set(`submitted:${survey.id}`, '1')
      setView('done')
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? ''
      if (msg.includes('DUPLICATE_RESPONSE')) { store.set(`submitted:${survey.id}`, '1'); setView('already') }
      else if (msg.includes('SURVEY_NOT_ACTIVE')) setView('closed')
      else setError(friendlyError(err))
    } finally {
      setSubmitting(false)
    }
  }

  const shell = (body: React.ReactNode) => <main className="mx-auto max-w-xl px-4 py-8 text-lg">{body}</main>

  if (view === 'loading') return shell(<p>Loading survey...</p>)
  if (view === 'done') return shell(<div className="card text-center"><h1 className="text-2xl font-bold">Thank you!</h1><p className="mt-2">Your response has been recorded.</p></div>)
  if (MESSAGES[view]) return shell(<div className="card text-center"><p className="font-medium">{MESSAGES[view]}</p></div>)
  if (!survey) return shell(<p role="alert" className="error">{error}</p>)

  return shell(
    <form onSubmit={submit} noValidate>
      <h1 className="text-2xl font-bold">{survey.title}</h1>
      {survey.description && <p className="mt-1 text-slate-700">{survey.description}</p>}
      <ol className="mt-6 space-y-8">
        {survey.questions.map((q, i) => (
          <li key={q.id}>
            <fieldset>
              <legend className="mb-3 font-semibold">{i + 1}. {q.question_text}</legend>
              <div className="space-y-3">
                {q.choices.map((c) => (
                  <label key={c.id}
                    className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border-2 bg-white px-4 py-3 ${picked[q.id] === c.id ? 'border-blue-700 bg-blue-50' : 'border-slate-300'}`}>
                    <input type="radio" name={q.id} value={c.id} className="size-5 accent-blue-700" checked={picked[q.id] === c.id}
                      onChange={() => setPicked((p) => ({ ...p, [q.id]: c.id }))} />
                    <span>{c.choice_text}</span>
                  </label>
                ))}
              </div>
              {showMissing && !picked[q.id] && <p className="error">Please choose an answer.</p>}
            </fieldset>
          </li>
        ))}
      </ol>
      {error && <p role="alert" className="error mt-6">{error}</p>}
      <button className="btn btn-primary mt-8 w-full text-lg" disabled={submitting}>{submitting ? 'Submitting...' : 'Submit'}</button>
    </form>,
  )
}
