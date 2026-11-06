-- Classroom Survey Web App - initial schema (see DATABASE.md)
-- Run once in the Supabase SQL Editor, or with `supabase db push`.

-- =========================================================
-- Tables
-- =========================================================

create table surveys (
    id uuid primary key default gen_random_uuid(),
    title text not null,
    description text,
    status text not null default 'draft'
        check (status in ('draft', 'active', 'closed', 'archived')),
    public_slug text unique,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create index surveys_status_idx on surveys(status);

-- Only one survey may be active at a time.
create unique index only_one_active_survey on surveys ((status)) where status = 'active';

create table questions (
    id uuid primary key default gen_random_uuid(),
    survey_id uuid not null references surveys(id) on delete cascade,
    question_text text not null,
    question_type text not null
        check (question_type in ('multiple_choice', 'true_false')),
    position integer not null,
    created_at timestamptz not null default now()
);
create index questions_survey_id_idx on questions(survey_id);

create table choices (
    id uuid primary key default gen_random_uuid(),
    question_id uuid not null references questions(id) on delete cascade,
    choice_text text not null,
    position integer not null,
    created_at timestamptz not null default now()
);
create index choices_question_id_idx on choices(question_id);

create table responses (
    id uuid primary key default gen_random_uuid(),
    survey_id uuid not null references surveys(id) on delete cascade,
    anonymous_token text,
    submitted_at timestamptz not null default now()
);
create index responses_survey_id_idx on responses(survey_id);
create index responses_submitted_at_idx on responses(submitted_at);
create unique index responses_unique_student_per_survey
    on responses(survey_id, anonymous_token) where anonymous_token is not null;

create table answers (
    id uuid primary key default gen_random_uuid(),
    response_id uuid not null references responses(id) on delete cascade,
    question_id uuid not null references questions(id) on delete cascade,
    choice_id uuid references choices(id) on delete set null,
    text_answer text,
    created_at timestamptz not null default now(),
    unique (response_id, question_id)
);
create index answers_response_id_idx on answers(response_id);
create index answers_question_id_idx on answers(question_id);
create index answers_choice_id_idx on answers(choice_id);

-- =========================================================
-- updated_at trigger
-- =========================================================

create or replace function update_updated_at_column()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

create trigger surveys_updated_at
before update on surveys
for each row execute function update_updated_at_column();

-- =========================================================
-- Row Level Security
-- =========================================================

alter table surveys enable row level security;
alter table questions enable row level security;
alter table choices enable row level security;
alter table responses enable row level security;
alter table answers enable row level security;

-- Students (anon): read-only access to the active survey and its questions/choices.
-- No anon policies exist on responses/answers, so students can never read results.
create policy "students read active surveys"
on surveys for select to anon
using (status = 'active');

create policy "students read active survey questions"
on questions for select to anon
using (exists (
    select 1 from surveys
    where surveys.id = questions.survey_id and surveys.status = 'active'
));

create policy "students read active survey choices"
on choices for select to anon
using (exists (
    select 1 from questions
    join surveys on surveys.id = questions.survey_id
    where questions.id = choices.question_id and surveys.status = 'active'
));

-- Instructor (any authenticated user - public sign-ups must be disabled in Supabase Auth).
create policy "authenticated users manage surveys"
on surveys for all to authenticated using (true) with check (true);
create policy "authenticated users manage questions"
on questions for all to authenticated using (true) with check (true);
create policy "authenticated users manage choices"
on choices for all to authenticated using (true) with check (true);
create policy "authenticated users manage responses"
on responses for all to authenticated using (true) with check (true);
create policy "authenticated users manage answers"
on answers for all to authenticated using (true) with check (true);

-- =========================================================
-- Instructor RPCs (security invoker: RLS still applies)
-- =========================================================

-- Create (p_survey_id null) or replace the contents of a draft survey in one transaction.
-- p_questions: [{"question_text": "...", "question_type": "multiple_choice", "choices": ["A", "B"]}]
create or replace function save_survey(
    p_survey_id uuid,
    p_title text,
    p_description text,
    p_questions jsonb
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
    v_id uuid;
    q record;
    v_question_id uuid;
begin
    if p_survey_id is null then
        insert into surveys (title, description)
        values (p_title, p_description)
        returning id into v_id;
    else
        -- Only drafts are editable: drafts never have responses, so replacing questions is safe.
        update surveys set title = p_title, description = p_description
        where id = p_survey_id and status = 'draft'
        returning id into v_id;
        if v_id is null then
            raise exception 'SURVEY_NOT_EDITABLE';
        end if;
        delete from questions where survey_id = v_id;
    end if;

    for q in select value, ordinality from jsonb_array_elements(p_questions) with ordinality loop
        insert into questions (survey_id, question_text, question_type, position)
        values (v_id, q.value->>'question_text', q.value->>'question_type', q.ordinality)
        returning id into v_question_id;

        insert into choices (question_id, choice_text, position)
        select v_question_id, c.value #>> '{}', c.ordinality
        from jsonb_array_elements(q.value->'choices') with ordinality as c;
    end loop;

    return v_id;
end;
$$;

-- Close any active survey, assign a public slug if needed, and activate the requested one.
create or replace function activate_survey(p_survey_id uuid)
returns surveys
language plpgsql
set search_path = public
as $$
declare
    v surveys;
begin
    if not exists (select 1 from questions where survey_id = p_survey_id) then
        raise exception 'SURVEY_HAS_NO_QUESTIONS';
    end if;

    update surveys set status = 'closed'
    where status = 'active' and id <> p_survey_id;

    -- ponytail: 10 hex chars of a v4 UUID (40 random bits); a collision fails the unique index, retry activates again.
    update surveys
    set status = 'active',
        public_slug = coalesce(public_slug, substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))
    where id = p_survey_id and status in ('draft', 'closed', 'active')
    returning * into v;

    if v.id is null then
        raise exception 'SURVEY_NOT_FOUND';
    end if;
    return v;
end;
$$;

create or replace function close_survey(p_survey_id uuid)
returns void
language sql
set search_path = public
as $$
    update surveys set status = 'closed' where id = p_survey_id and status = 'active';
$$;

revoke execute on function save_survey(uuid, text, text, jsonb) from public, anon;
revoke execute on function activate_survey(uuid) from public, anon;
revoke execute on function close_survey(uuid) from public, anon;
grant execute on function save_survey(uuid, text, text, jsonb) to authenticated;
grant execute on function activate_survey(uuid) to authenticated;
grant execute on function close_survey(uuid) to authenticated;

-- =========================================================
-- Student RPCs (security definer: the only way anon can write)
-- =========================================================

-- Lets the student page tell "closed" apart from "not found" without exposing closed surveys.
create or replace function survey_status_by_slug(p_slug text)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select status from surveys where public_slug = p_slug;
$$;

-- Validate and store one submission atomically.
-- p_answers: [{"question_id": "uuid", "choice_id": "uuid"}]
create or replace function submit_survey_response(
    p_survey_id uuid,
    p_anonymous_token text,
    p_answers jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_status text;
    v_response_id uuid;
begin
    -- FOR SHARE blocks a concurrent close until this submission commits (and vice versa).
    select status into v_status from surveys where id = p_survey_id for share;
    if v_status is distinct from 'active' then
        raise exception 'SURVEY_NOT_ACTIVE';
    end if;

    if p_anonymous_token is null or length(p_anonymous_token) not between 8 and 128 then
        raise exception 'INVALID_TOKEN';
    end if;

    if jsonb_typeof(p_answers) is distinct from 'array' then
        raise exception 'MISSING_REQUIRED_ANSWER';
    end if;

    if exists (
        select 1 from jsonb_to_recordset(p_answers) as s(question_id uuid, choice_id uuid)
        left join questions q on q.id = s.question_id and q.survey_id = p_survey_id
        where q.id is null
    ) or exists (
        select question_id from jsonb_to_recordset(p_answers) as s(question_id uuid, choice_id uuid) group by question_id having count(*) > 1
    ) then
        raise exception 'INVALID_QUESTION';
    end if;

    if exists (
        select 1 from jsonb_to_recordset(p_answers) as s(question_id uuid, choice_id uuid)
        left join choices c on c.id = s.choice_id and c.question_id = s.question_id
        where c.id is null
    ) then
        raise exception 'INVALID_CHOICE';
    end if;

    if exists (
        select 1 from questions q
        where q.survey_id = p_survey_id
        and not exists (select 1 from jsonb_to_recordset(p_answers) as s(question_id uuid, choice_id uuid) where s.question_id = q.id)
    ) then
        raise exception 'MISSING_REQUIRED_ANSWER';
    end if;

    begin
        insert into responses (survey_id, anonymous_token)
        values (p_survey_id, p_anonymous_token)
        returning id into v_response_id;
    exception when unique_violation then
        raise exception 'DUPLICATE_RESPONSE';
    end;

    insert into answers (response_id, question_id, choice_id)
    select v_response_id, s.question_id, s.choice_id
    from jsonb_to_recordset(p_answers) as s(question_id uuid, choice_id uuid);

    return jsonb_build_object('success', true, 'response_id', v_response_id);
end;
$$;

revoke execute on function survey_status_by_slug(text) from public;
revoke execute on function submit_survey_response(uuid, text, jsonb) from public;
grant execute on function survey_status_by_slug(text) to anon, authenticated;
grant execute on function submit_survey_response(uuid, text, jsonb) to anon, authenticated;
