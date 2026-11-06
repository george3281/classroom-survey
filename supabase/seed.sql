-- Local development only (`npx supabase start` / `supabase db reset`). Never run against production.
-- Creates instructor@example.com / password123 and one draft survey.
insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new
) values (
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
    'instructor@example.com', crypt('password123', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
);

insert into auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at)
select gen_random_uuid(), id, id::text, jsonb_build_object('sub', id::text, 'email', email), 'email', now(), now()
from auth.users where email = 'instructor@example.com';

select save_survey(null, 'Recursion Concept Check', 'Quick understanding check', '[
  {"question_text": "What is required for a recursive function?", "question_type": "multiple_choice",
   "choices": ["A base case", "A pointer", "A loop", "A compiler"]},
  {"question_text": "Every recursive function needs a stopping condition.", "question_type": "true_false",
   "choices": ["True", "False"]}
]'::jsonb);
