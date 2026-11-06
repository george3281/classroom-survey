import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import QRCode from 'qrcode'
import { closeSurvey, countResponses, friendlyError, getSurvey } from '../lib/api'
import type { Survey } from '../lib/results'

export default function Present() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [survey, setSurvey] = useState<Survey | null | undefined>(undefined)
  const [qr, setQr] = useState('')
  const [count, setCount] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [closing, setClosing] = useState(false)

  const url = survey?.public_slug ? `${window.location.origin}/s/${survey.public_slug}` : ''

  useEffect(() => {
    getSurvey(id).then(setSurvey).catch((e) => setError(friendlyError(e)))
  }, [id])

  useEffect(() => {
    if (url) QRCode.toDataURL(url, { width: 1024, margin: 2, errorCorrectionLevel: 'M' }).then(setQr)
  }, [url])

  // ponytail: polls every 3s; switch to Supabase Realtime if it ever matters.
  useEffect(() => {
    if (survey?.status !== 'active') return
    const tick = () => countResponses(id).then(setCount).catch(() => {})
    tick()
    const t = setInterval(tick, 3000)
    return () => clearInterval(t)
  }, [id, survey?.status])

  async function close() {
    if (!confirm(`Close "${survey?.title}"? Students will no longer be able to submit.`)) return
    setClosing(true)
    try {
      await closeSurvey(id)
      navigate(`/surveys/${id}/results`)
    } catch (e) {
      setError(friendlyError(e))
      setClosing(false)
    }
  }

  if (error) return <main className="p-8"><p role="alert" className="error">{error}</p><Link className="btn mt-4" to="/dashboard">Back to Dashboard</Link></main>
  if (survey === undefined) return <p className="p-8">Loading survey...</p>
  if (survey === null || survey.status !== 'active')
    return (
      <main className="space-y-4 p-8">
        <p>{survey ? 'This survey is not active. Activate it from the dashboard to present it.' : 'Survey not found.'}</p>
        <Link className="btn" to="/dashboard">Back to Dashboard</Link>
      </main>
    )

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-white p-6 text-center">
      <h1 className="text-4xl font-bold md:text-5xl">{survey.title}</h1>
      {qr && <img src={qr} alt={`QR code linking to ${url}`} className="aspect-square w-[min(60vh,90vw)]" />}
      <p className="break-all font-mono text-2xl font-semibold md:text-3xl">{url.replace(/^https?:\/\//, '')}</p>
      <p className="text-3xl" aria-live="polite">Responses: <strong>{count ?? '...'}</strong></p>
      <div className="flex flex-wrap justify-center gap-3">
        <Link className="btn" to={`/surveys/${id}/results`}>View Results</Link>
        {qr && <a className="btn" href={qr} download={`survey-qr-${survey.public_slug}.png`}>Download QR Code</a>}
        <button className="btn" onClick={() => document.documentElement.requestFullscreen?.()}>Full Screen</button>
        <button className="btn btn-danger" disabled={closing} onClick={close}>{closing ? 'Closing...' : 'Close Survey'}</button>
      </div>
    </main>
  )
}
