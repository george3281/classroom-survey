import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Shell } from '../components/ui'
import { activateSurvey, friendlyError, getSurvey, saveSurvey } from '../lib/api'
import type { QuestionType } from '../lib/results'

interface Q { key: string; question_text: string; question_type: QuestionType; choices: string[] }

const TRUE_FALSE = ['True', 'False']
const newQuestion = (): Q => ({ key: crypto.randomUUID(), question_text: '', question_type: 'multiple_choice', choices: ['', ''] })

function move<T>(list: T[], i: number, delta: number): T[] {
  const j = i + delta
  if (j < 0 || j >= list.length) return list
  const copy = [...list]
  ;[copy[i], copy[j]] = [copy[j], copy[i]]
  return copy
}

function validate(title: string, questions: Q[]) {
  const errors: Record<string, string> = {}
  if (!title.trim()) errors.title = 'Title is required.'
  if (questions.length === 0) errors.questions = 'Add at least one question.'
  for (const q of questions) {
    if (!q.question_text.trim()) errors[`${q.key}.text`] = 'Question text is required.'
    if (q.choices.length < 2) errors[`${q.key}.choices`] = 'Add at least two choices.'
    else if (q.choices.some((c) => !c.trim())) errors[`${q.key}.choices`] = 'Choices cannot be blank.'
    else if (new Set(q.choices.map((c) => c.trim().toLowerCase())).size !== q.choices.length)
      errors[`${q.key}.choices`] = 'Choices must be different.'
  }
  return errors
}

export default function Editor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [questions, setQuestions] = useState<Q[]>(() => [newQuestion()])
  const [loading, setLoading] = useState(Boolean(id))
  const [locked, setLocked] = useState(false)
  const [showErrors, setShowErrors] = useState(false)
  const [busy, setBusy] = useState<'' | 'save' | 'activate'>('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!id) return
    getSurvey(id)
      .then((s) => {
        if (!s) return setError('Survey not found.')
        setTitle(s.title)
        setDescription(s.description ?? '')
        setQuestions(s.questions.map((q) => ({ key: q.id, question_text: q.question_text, question_type: q.question_type, choices: q.choices.map((c) => c.choice_text) })))
        setLocked(s.status !== 'draft')
      })
      .catch((e) => setError(friendlyError(e)))
      .finally(() => setLoading(false))
  }, [id])

  const errors = validate(title, questions)
  const err = (k: string) => showErrors && errors[k] && <p className="error">{errors[k]}</p>
  const update = (key: string, patch: Partial<Q>) => setQuestions((qs) => qs.map((q) => (q.key === key ? { ...q, ...patch } : q)))

  async function save(activate: boolean) {
    setShowErrors(true)
    setMessage('')
    setError('')
    if (Object.keys(errors).length) return setError('Please fix the highlighted fields.')
    setBusy(activate ? 'activate' : 'save')
    try {
      const payload = questions.map((q) => ({ question_text: q.question_text.trim(), question_type: q.question_type, choices: q.choices.map((c) => c.trim()) }))
      const savedId = await saveSurvey(id ?? null, title.trim(), description.trim(), payload)
      if (activate) {
        await activateSurvey(savedId)
        return navigate(`/surveys/${savedId}/present`)
      }
      setMessage('Saved')
      if (!id) navigate(`/surveys/${savedId}/edit`, { replace: true })
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setBusy('')
    }
  }

  if (loading) return <Shell><p>Loading survey...</p></Shell>
  if (locked)
    return (
      <Shell>
        <div className="card space-y-3">
          <h1 className="text-xl font-bold">{title}</h1>
          <p>Only draft surveys can be edited. Active surveys must be closed first, and surveys that have been used keep their questions so results stay accurate. Use Duplicate on the dashboard to make an editable copy.</p>
          <Link to="/dashboard" className="btn">Back to Dashboard</Link>
        </div>
      </Shell>
    )

  return (
    <Shell>
      <h1 className="mb-6 text-2xl font-bold">{id ? 'Edit Survey' : 'New Survey'}</h1>
      <div className="card mb-6 space-y-4">
        <div>
          <label htmlFor="title" className="mb-1 block font-medium">Survey Title</label>
          <input id="title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
          {err('title')}
        </div>
        <div>
          <label htmlFor="description" className="mb-1 block font-medium">Description (optional)</label>
          <textarea id="description" className="input" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
      </div>

      <ol className="space-y-4">
        {questions.map((q, qi) => (
          <li key={q.key} className="card space-y-4">
            <fieldset className="space-y-4">
              <legend className="text-lg font-semibold">Question {qi + 1}</legend>
              <div>
                <label htmlFor={`${q.key}-text`} className="sr-only">Question {qi + 1} text</label>
                <input id={`${q.key}-text`} className="input" placeholder="Question text" value={q.question_text}
                  onChange={(e) => update(q.key, { question_text: e.target.value })} />
                {err(`${q.key}.text`)}
              </div>
              <div>
                <label htmlFor={`${q.key}-type`} className="mb-1 block font-medium">Type</label>
                <select id={`${q.key}-type`} className="input sm:w-64" value={q.question_type}
                  onChange={(e) => {
                    const type = e.target.value as QuestionType
                    update(q.key, { question_type: type, choices: type === 'true_false' ? TRUE_FALSE : ['', ''] })
                  }}>
                  <option value="multiple_choice">Multiple Choice</option>
                  <option value="true_false">True / False</option>
                </select>
              </div>
              <div>
                <p className="mb-2 font-medium">Choices</p>
                {q.question_type === 'true_false' ? (
                  <p className="text-slate-700">True / False</p>
                ) : (
                  <ul className="space-y-2">
                    {q.choices.map((c, ci) => (
                      <li key={ci} className="flex gap-2">
                        <label htmlFor={`${q.key}-c${ci}`} className="sr-only">Question {qi + 1} choice {ci + 1}</label>
                        <input id={`${q.key}-c${ci}`} className="input" placeholder={`Choice ${ci + 1}`} value={c}
                          onChange={(e) => update(q.key, { choices: q.choices.map((x, i) => (i === ci ? e.target.value : x)) })} />
                        <button type="button" className="btn px-3" aria-label={`Move choice ${ci + 1} up`} onClick={() => update(q.key, { choices: move(q.choices, ci, -1) })}>↑</button>
                        <button type="button" className="btn px-3" aria-label={`Move choice ${ci + 1} down`} onClick={() => update(q.key, { choices: move(q.choices, ci, 1) })}>↓</button>
                        <button type="button" className="btn btn-danger px-3" aria-label={`Delete choice ${ci + 1}`}
                          onClick={() => update(q.key, { choices: q.choices.filter((_, i) => i !== ci) })}>✕</button>
                      </li>
                    ))}
                  </ul>
                )}
                {err(`${q.key}.choices`)}
                {q.question_type === 'multiple_choice' && (
                  <button type="button" className="btn mt-2" onClick={() => update(q.key, { choices: [...q.choices, ''] })}>+ Add Choice</button>
                )}
              </div>
            </fieldset>
            <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-4">
              <button type="button" className="btn" disabled={qi === 0} onClick={() => setQuestions((qs) => move(qs, qi, -1))}>Move Up</button>
              <button type="button" className="btn" disabled={qi === questions.length - 1} onClick={() => setQuestions((qs) => move(qs, qi, 1))}>Move Down</button>
              <button type="button" className="btn btn-danger"
                onClick={() => confirm(`Delete question ${qi + 1}?`) && setQuestions((qs) => qs.filter((x) => x.key !== q.key))}>
                Delete Question
              </button>
            </div>
          </li>
        ))}
      </ol>
      {err('questions')}

      <button type="button" className="btn mt-4" onClick={() => setQuestions((qs) => [...qs, newQuestion()])}>+ Add Question</button>

      <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-slate-200 pt-6">
        <button className="btn" disabled={!!busy} onClick={() => save(false)}>{busy === 'save' ? 'Saving...' : 'Save Draft'}</button>
        <button className="btn btn-primary" disabled={!!busy} onClick={() => save(true)}>{busy === 'activate' ? 'Activating...' : 'Save & Activate'}</button>
        <Link to="/dashboard" className="btn">Back to Dashboard</Link>
        <span role="status" className="font-medium text-green-800">{message}</span>
        {error && <p role="alert" className="error w-full">{error}</p>}
      </div>
    </Shell>
  )
}
