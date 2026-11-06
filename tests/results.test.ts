import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeResults, csvCell, toCsv, type Question, type ResponseRow } from '../src/lib/results.ts'

const questions: Question[] = [
  { id: 'q1', question_text: 'Pick "one", please', question_type: 'multiple_choice', position: 1, choices: [
    { id: 'a', choice_text: 'A, the first', position: 1 },
    { id: 'b', choice_text: '=HYPERLINK("x")', position: 2 },
    { id: 'c', choice_text: 'C', position: 3 },
  ] },
]
const responses: ResponseRow[] = [
  { id: 'r1', submitted_at: 't1', answers: [{ question_id: 'q1', choice_id: 'a' }] },
  { id: 'r2', submitted_at: 't2', answers: [{ question_id: 'q1', choice_id: 'a' }] },
  { id: 'r3', submitted_at: 't3', answers: [{ question_id: 'q1', choice_id: 'b' }] },
]

test('computeResults counts and percentages', () => {
  const [r] = computeResults(questions, responses)
  assert.equal(r.response_count, 3)
  assert.deepEqual(r.choices.map((c) => [c.count, c.percentage]), [[2, 66.7], [1, 33.3], [0, 0]])
  assert.deepEqual(computeResults(questions, [])[0].choices.map((c) => c.percentage), [0, 0, 0])
})

test('csv escaping', () => {
  assert.equal(csvCell('a"b'), '"a""b"')
  assert.equal(csvCell('=1+1'), `"'=1+1"`)
  const lines = toCsv(questions, responses).split('\r\n')
  assert.equal(lines[0], '"response_id","submitted_at","Pick ""one"", please"')
  assert.equal(lines[1], '"r1","t1","A, the first"')
  assert.equal(lines[3], `"r3","t3","'=HYPERLINK(""x"")"`)
})
