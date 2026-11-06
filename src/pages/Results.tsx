import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Bar, BarChart, LabelList, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import { Shell, StatusBadge } from '../components/ui'
import { friendlyError, getResponses, getSurvey } from '../lib/api'
import { computeResults, toCsv, type ResponseRow, type SurveyWithQuestions } from '../lib/results'

export default function Results() {
  const { id = '' } = useParams()
  const [survey, setSurvey] = useState<SurveyWithQuestions | null | undefined>(undefined)
  const [responses, setResponses] = useState<ResponseRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [s, r] = await Promise.all([getSurvey(id), getResponses(id)])
      setSurvey(s)
      setResponses(r)
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setLoading(false)
    }
  }, [id])
  useEffect(() => { load() }, [load])

  function exportCsv() {
    if (!survey) return
    // BOM so Excel opens UTF-8 correctly.
    const blob = new Blob(['﻿' + toCsv(survey.questions, responses)], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${survey.title.replace(/[^\w-]+/g, '_')}_results.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  if (survey === undefined) return <Shell>{error ? <p role="alert" className="error">{error}</p> : <p>Loading results...</p>}</Shell>
  if (survey === null) return <Shell><p>Survey not found.</p><Link className="btn mt-4" to="/dashboard">Back to Dashboard</Link></Shell>

  const results = computeResults(survey.questions, responses)

  return (
    <Shell>
      <div className="mb-6 space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">{survey.title}</h1>
          <StatusBadge status={survey.status} />
        </div>
        <p className="text-lg">{responses.length} response{responses.length === 1 ? '' : 's'}</p>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        <button className="btn" disabled={loading} onClick={load}>{loading ? 'Refreshing...' : 'Refresh'}</button>
        <button className="btn" disabled={responses.length === 0} onClick={exportCsv}>Export CSV</button>
        {survey.status === 'active' && <Link className="btn" to={`/surveys/${id}/present`}>Present QR</Link>}
        <Link className="btn" to="/dashboard">Back to Dashboard</Link>
      </div>
      {error && <p role="alert" className="error mb-4">{error}</p>}

      {responses.length === 0 ? (
        <div className="card">
          <p className="font-medium">No responses yet.</p>
          <p className="text-slate-700">Display the QR code so students can join.</p>
        </div>
      ) : (
        <ol className="space-y-6">
          {results.map((q, i) => {
            const data = q.choices.map((c) => ({ ...c, label: `${c.count} (${c.percentage}%)` }))
            return (
              <li key={q.question_id} className="card">
                <h2 className="text-lg font-semibold">{i + 1}. {q.question_text}</h2>
                <p className="mb-3 text-sm text-slate-600">
                  {q.response_count === 0 ? 'Unanswered - no responses to this question.' : `${q.response_count} answered`}
                </p>
                <div aria-hidden="true" style={{ height: data.length * 52 + 10 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} layout="vertical" margin={{ left: 0, right: 90, top: 0, bottom: 0 }}>
                      <XAxis type="number" hide domain={[0, Math.max(1, ...data.map((d) => d.count))]} />
                      <YAxis type="category" dataKey="choice_text" width={170} tick={{ fill: '#0f172a', fontSize: 14 }} />
                      <Bar dataKey="count" fill="#1d4ed8" barSize={28} minPointSize={3} isAnimationActive={false}>
                        <LabelList dataKey="label" position="right" fill="#0f172a" fontSize={14} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <table className="sr-only">
                  <caption>{q.question_text}</caption>
                  <thead><tr><th>Choice</th><th>Count</th><th>Percent</th></tr></thead>
                  <tbody>{data.map((c) => <tr key={c.choice_id}><td>{c.choice_text}</td><td>{c.count}</td><td>{c.percentage}%</td></tr>)}</tbody>
                </table>
              </li>
            )
          })}
        </ol>
      )}
    </Shell>
  )
}
