import { lazy, Suspense } from 'react'
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, RequireAuth, useAuth } from './lib/auth'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Editor from './pages/Editor'
import Present from './pages/Present'
import StudentSurvey from './pages/StudentSurvey'

function Landing() {
  const { session } = useAuth()
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-4xl font-bold">Classroom Survey</h1>
      <p className="text-lg text-slate-700">Quick in-class understanding checks</p>
      <Link className="btn btn-primary" to={session ? '/dashboard' : '/login'}>
        {session ? 'Go to Dashboard' : 'Instructor Login'}
      </Link>
    </main>
  )
}

// Recharts is large; load it only for instructors viewing results, not on student phones.
const Results = lazy(() => import('./pages/Results'))

const instructor = (el: React.ReactNode) => (
  <RequireAuth>
    <Suspense fallback={<p className="p-8">Loading...</p>}>{el}</Suspense>
  </RequireAuth>
)

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/dashboard" element={instructor(<Dashboard />)} />
          <Route path="/surveys/new" element={instructor(<Editor />)} />
          <Route path="/surveys/:id/edit" element={instructor(<Editor />)} />
          <Route path="/surveys/:id/present" element={instructor(<Present />)} />
          <Route path="/surveys/:id/results" element={instructor(<Results />)} />
          <Route path="/s/:slug" element={<StudentSurvey />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
