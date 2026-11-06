// Pure helpers (no Supabase import) so tests/results.test.ts can run them under plain Node.

export type Status = 'draft' | 'active' | 'closed' | 'archived'
export type QuestionType = 'multiple_choice' | 'true_false'

export interface Choice { id: string; choice_text: string; position: number }
export interface Question { id: string; question_text: string; question_type: QuestionType; position: number; choices: Choice[] }
export interface Survey {
  id: string
  title: string
  description: string | null
  status: Status
  public_slug: string | null
  created_at: string
  updated_at: string
}
export interface SurveyWithQuestions extends Survey { questions: Question[] }
export interface ResponseRow { id: string; submitted_at: string; answers: { question_id: string; choice_id: string | null }[] }

export interface QuestionResult {
  question_id: string
  question_text: string
  response_count: number
  choices: { choice_id: string; choice_text: string; count: number; percentage: number }[]
}

export function computeResults(questions: Question[], responses: ResponseRow[]): QuestionResult[] {
  const counts = new Map<string, number>()
  for (const r of responses) for (const a of r.answers) if (a.choice_id) counts.set(a.choice_id, (counts.get(a.choice_id) ?? 0) + 1)

  return questions.map((q) => {
    const answered = q.choices.reduce((n, c) => n + (counts.get(c.id) ?? 0), 0)
    return {
      question_id: q.id,
      question_text: q.question_text,
      response_count: answered,
      choices: q.choices.map((c) => {
        const count = counts.get(c.id) ?? 0
        return { choice_id: c.id, choice_text: c.choice_text, count, percentage: answered ? Math.round((count / answered) * 1000) / 10 : 0 }
      }),
    }
  })
}

// Quote every cell, double embedded quotes, and neutralize spreadsheet formulas (=, +, -, @).
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return `"${safe.replace(/"/g, '""')}"`
}

export function toCsv(questions: Question[], responses: ResponseRow[]): string {
  const choiceText = new Map(questions.flatMap((q) => q.choices.map((c) => [c.id, c.choice_text] as const)))
  const header = ['response_id', 'submitted_at', ...questions.map((q) => q.question_text)]
  const rows = responses.map((r) => {
    const byQuestion = new Map(r.answers.map((a) => [a.question_id, a.choice_id]))
    return [r.id, r.submitted_at, ...questions.map((q) => choiceText.get(byQuestion.get(q.id) ?? '') ?? '')]
  })
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')
}
