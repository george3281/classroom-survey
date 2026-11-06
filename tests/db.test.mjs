// Runs the real migration in an in-process Postgres (PGlite) and checks RLS + RPCs
// as the same roles Supabase uses: `anon` (students) and `authenticated` (instructor).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const dir = new URL('../supabase/migrations/', import.meta.url)
const db = new PGlite()

// Mimic Supabase: roles exist and get table/function privileges; RLS does the gating.
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
`)
for (const f of readdirSync(dir).sort()) await db.exec(readFileSync(new URL(f, dir), 'utf8'))

const as = async (role, sql, params) => {
  await db.exec(`set role ${role}`)
  try { return (await db.query(sql, params)).rows } finally { await db.exec('reset role') }
}
const rejects = (p, code) => assert.rejects(p, (e) => e.message.includes(code))

const qs = JSON.stringify([
  { question_text: 'Recursion needs?', question_type: 'multiple_choice', choices: ['Base case', 'Loop'] },
  { question_text: 'True?', question_type: 'true_false', choices: ['True', 'False'] },
])

test('full workflow with RLS', async () => {
  // Students cannot create or call instructor RPCs.
  await rejects(as('anon', `insert into surveys(title) values ('x')`), 'row-level security')
  await rejects(as('anon', `select save_survey(null, 'x', null, '[]')`), 'permission denied')

  const [{ save_survey: id }] = await as('authenticated', `select save_survey(null, 'S1', 'd', $1)`, [qs])
  assert.equal((await as('authenticated', `select * from questions where survey_id = $1`, [id])).length, 2)
  assert.equal((await as('anon', `select * from surveys`)).length, 0, 'draft is hidden from anon')

  // Activation: slug generated, only one active at a time.
  const [{ save_survey: id2 }] = await as('authenticated', `select save_survey(null, 'S2', null, $1)`, [qs])
  await as('authenticated', `select activate_survey($1)`, [id2])
  const [{ public_slug: slug }] = await as('authenticated', `select (activate_survey($1)).*`, [id])
  assert.match(slug, /^[0-9a-f]{10}$/)
  const statuses = await as('authenticated', `select id, status from surveys order by title`)
  assert.deepEqual(statuses.map((s) => s.status), ['active', 'closed'])
  await rejects(as('authenticated', `select save_survey($1, 'edit', null, '[]')`, [id]), 'SURVEY_NOT_EDITABLE')

  // Student reads the active survey, its questions and choices.
  const [s] = await as('anon', `select * from surveys where public_slug = $1`, [slug])
  assert.equal(s.id, id)
  const qRows = await as('anon', `select q.id, array_agg(c.id order by c.position) as choices
    from questions q join choices c on c.question_id = q.id where q.survey_id = $1
    group by q.id, q.position order by q.position`, [id])
  assert.equal(qRows.length, 2)
  assert.equal((await as('anon', `select * from questions where survey_id = $1`, [id2])).length, 0, 'closed survey hidden')

  const answers = qRows.map((q) => ({ question_id: q.id, choice_id: q.choices[0] }))
  const submit = (token, a = answers, sid = id) =>
    as('anon', `select submit_survey_response($1, $2, $3) as r`, [sid, token, JSON.stringify(a)])

  const [{ r }] = await submit('token-aaaa-1')
  assert.equal(r.success, true)
  await rejects(submit('token-aaaa-1'), 'DUPLICATE_RESPONSE')
  await rejects(submit('token-bbbb-2', answers.slice(0, 1)), 'MISSING_REQUIRED_ANSWER')
  await rejects(submit('token-bbbb-2', [answers[0], { ...answers[1], choice_id: qRows[0].choices[1] }]), 'INVALID_CHOICE')
  await rejects(submit('token-bbbb-2', [answers[0], answers[0], answers[1]]), 'INVALID_QUESTION')
  await rejects(submit('token-bbbb-2', answers, id2), 'SURVEY_NOT_ACTIVE')

  // Students can never read results or tamper with surveys.
  assert.equal((await as('anon', `select * from responses`)).length, 0)
  assert.equal((await as('anon', `select * from answers`)).length, 0)
  await as('anon', `update surveys set title = 'hacked'`)
  await as('anon', `delete from surveys`)
  assert.equal((await as('authenticated', `select * from surveys where title = 'S1'`)).length, 1)
  await rejects(as('anon', `insert into responses(survey_id) values ($1)`, [id]), 'row-level security')

  // Instructor sees results; closing stops submissions; status lookup works for anon.
  assert.equal((await as('authenticated', `select * from answers`)).length, 2)
  await as('authenticated', `select close_survey($1)`, [id])
  await rejects(submit('token-cccc-3'), 'SURVEY_NOT_ACTIVE')
  assert.equal((await as('anon', `select survey_status_by_slug($1) as s`, [slug]))[0].s, 'closed')
  assert.equal((await as('anon', `select survey_status_by_slug('nope') as s`))[0].s, null)

  // Delete cascades to questions, choices, responses, answers.
  await as('authenticated', `delete from surveys where id = $1`, [id])
  const left = await as('authenticated', `select (select count(*) from responses)::int r, (select count(*) from answers)::int a`)
  assert.deepEqual(left[0], { r: 0, a: 0 })
})
