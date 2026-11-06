import { supabase } from './supabase'
import type { QuestionType, ResponseRow, Status, Survey, SurveyWithQuestions } from './results'

export interface SurveyListItem extends Survey { response_count: number }
export interface DraftQuestion { question_text: string; question_type: QuestionType; choices: string[] }

function sortNested(s: SurveyWithQuestions): SurveyWithQuestions {
  s.questions.sort((a, b) => a.position - b.position)
  for (const q of s.questions) q.choices.sort((a, b) => a.position - b.position)
  return s
}

async function run<T>(p: PromiseLike<{ data: T; error: unknown }>): Promise<T> {
  const { data, error } = await p
  if (error) throw error
  return data
}

export async function listSurveys(): Promise<SurveyListItem[]> {
  const rows = await run(
    supabase.from('surveys').select('*, responses(count)').order('created_at', { ascending: false }),
  )
  return (rows as (Survey & { responses: { count: number }[] })[]).map(({ responses, ...s }) => ({
    ...s,
    response_count: responses[0]?.count ?? 0,
  }))
}

export async function getSurvey(id: string): Promise<SurveyWithQuestions | null> {
  const row = await run(supabase.from('surveys').select('*, questions(*, choices(*))').eq('id', id).maybeSingle())
  return row ? sortNested(row as SurveyWithQuestions) : null
}

// RLS only lets anonymous students see the active survey, so this returns null otherwise.
export async function getActiveSurveyBySlug(slug: string): Promise<SurveyWithQuestions | null> {
  const row = await run(
    supabase.from('surveys').select('*, questions(*, choices(*))').eq('public_slug', slug).eq('status', 'active').maybeSingle(),
  )
  return row ? sortNested(row as SurveyWithQuestions) : null
}

export const surveyStatusBySlug = (slug: string) =>
  run(supabase.rpc('survey_status_by_slug', { p_slug: slug })) as Promise<Status | null>

export const saveSurvey = (id: string | null, title: string, description: string, questions: DraftQuestion[]) =>
  run(supabase.rpc('save_survey', { p_survey_id: id, p_title: title, p_description: description || null, p_questions: questions })) as Promise<string>

export const activateSurvey = (id: string) => run(supabase.rpc('activate_survey', { p_survey_id: id })) as Promise<Survey>
export const closeSurvey = (id: string) => run(supabase.rpc('close_survey', { p_survey_id: id }))
export const archiveSurvey = (id: string) => run(supabase.from('surveys').update({ status: 'archived' }).eq('id', id))
export const deleteSurvey = (id: string) => run(supabase.from('surveys').delete().eq('id', id))

export async function duplicateSurvey(id: string): Promise<string> {
  const s = await getSurvey(id)
  if (!s) throw new Error('SURVEY_NOT_FOUND')
  const questions = s.questions.map((q) => ({
    question_text: q.question_text,
    question_type: q.question_type,
    choices: q.choices.map((c) => c.choice_text),
  }))
  return saveSurvey(null, `Copy of ${s.title}`, s.description ?? '', questions)
}

export async function countResponses(surveyId: string): Promise<number> {
  const { count, error } = await supabase.from('responses').select('id', { count: 'exact', head: true }).eq('survey_id', surveyId)
  if (error) throw error
  return count ?? 0
}

// ponytail: one request, capped by PostgREST's default 1000-row limit; page with .range() if a survey exceeds 1000 responses.
export const getResponses = (surveyId: string) =>
  run(
    supabase.from('responses').select('id, submitted_at, answers(question_id, choice_id)').eq('survey_id', surveyId).order('submitted_at'),
  ) as Promise<ResponseRow[]>

export const submitResponse = (surveyId: string, token: string, answers: { question_id: string; choice_id: string }[]) =>
  run(supabase.rpc('submit_survey_response', { p_survey_id: surveyId, p_anonymous_token: token, p_answers: answers }))

const MESSAGES: Record<string, string> = {
  SURVEY_NOT_ACTIVE: 'This survey is no longer accepting responses.',
  DUPLICATE_RESPONSE: 'You have already submitted a response to this survey.',
  INVALID_QUESTION: 'This survey has changed. Please reload the page and try again.',
  INVALID_CHOICE: 'This survey has changed. Please reload the page and try again.',
  MISSING_REQUIRED_ANSWER: 'Please answer every question before submitting.',
  INVALID_TOKEN: 'Your browser blocked the information needed to submit. Please try another browser.',
  SURVEY_NOT_EDITABLE: 'Only draft surveys can be edited. Duplicate it to make changes.',
  SURVEY_HAS_NO_QUESTIONS: 'Add at least one question before activating.',
  SURVEY_NOT_FOUND: 'Survey not found.',
  'Invalid login credentials': 'Incorrect email or password.',
  'Failed to fetch': 'Network error. Check your connection and try again.',
  JWT: 'Your session has expired. Please log in again.',
}

// Never show raw database errors: map known codes to friendly text, everything else to a generic message.
export function friendlyError(e: unknown): string {
  const msg = (e as { message?: string })?.message ?? ''
  const key = Object.keys(MESSAGES).find((k) => msg.includes(k))
  return key ? MESSAGES[key] : 'Something went wrong. Please try again.'
}
