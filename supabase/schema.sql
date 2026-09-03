create extension if not exists pgcrypto;

-- =========================================================
-- LANGUAGES
-- =========================================================

create table if not exists public.languages (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  native_name text,
  is_active boolean not null default true,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================================================
-- VOCABULARY
-- =========================================================

create table if not exists public.vocabulary (
  id uuid primary key default gen_random_uuid(),
  language_id uuid not null
    references public.languages(id) on delete cascade,
  word text not null,
  normalized_word text not null,
  part_of_speech text not null,
  translation text,
  pronunciation text,
  level text,
  definition text,
  image_url text,
  audio_url text,
  metadata jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique(language_id, normalized_word, part_of_speech)
);

create table if not exists public.word_forms (
  id uuid primary key default gen_random_uuid(),
  vocabulary_id uuid not null
    references public.vocabulary(id) on delete cascade,
  form_type text not null,
  form text not null,

  unique(vocabulary_id, form_type)
);

create table if not exists public.word_relations (
  id uuid primary key default gen_random_uuid(),
  from_word_id uuid not null
    references public.vocabulary(id) on delete cascade,
  to_word_id uuid not null
    references public.vocabulary(id) on delete cascade,
  relation_type text not null,
  weight numeric(5,2) not null default 1,

  unique(from_word_id, to_word_id, relation_type)
);

-- =========================================================
-- GRAMMAR
-- =========================================================

create table if not exists public.grammar (
  id uuid primary key default gen_random_uuid(),
  language_id uuid not null
    references public.languages(id) on delete cascade,
  code text not null,
  name text not null,
  level text,
  description text,
  rules jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique(language_id, code)
);

create table if not exists public.sentence_patterns (
  id uuid primary key default gen_random_uuid(),
  grammar_id uuid not null
    references public.grammar(id) on delete cascade,
  code text not null,
  name text not null,
  slots jsonb not null,
  rules jsonb not null default '{}'::jsonb,

  unique(grammar_id, code)
);

-- =========================================================
-- LESSONS
-- =========================================================

create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  language_id uuid not null
    references public.languages(id) on delete cascade,
  grammar_id uuid
    references public.grammar(id) on delete set null,
  pattern_id uuid
    references public.sentence_patterns(id) on delete set null,
  slug text unique not null,
  title text not null,
  level text,
  order_index integer not null default 0,
  target_sentence jsonb not null,
  image_url text,
  audio_url text,
  base_xp integer not null default 50,
  creativity_xp integer not null default 20,
  hint text,
  settings jsonb not null default '{}'::jsonb,
  is_published boolean not null default false,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lesson_words (
  lesson_id uuid not null
    references public.lessons(id) on delete cascade,
  vocabulary_id uuid not null
    references public.vocabulary(id) on delete cascade,
  role text,
  sort_order integer not null default 0,

  primary key(lesson_id, vocabulary_id)
);

create table if not exists public.valid_sentences (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null
    references public.lessons(id) on delete cascade,
  tokens jsonb not null,
  sentence_text text not null,
  source text not null default 'admin',
  confidence numeric(5,4),
  is_approved boolean not null default false,
  created_at timestamptz not null default now(),

  unique(lesson_id, sentence_text)
);

-- =========================================================
-- LESSON GRAMMAR INTRO
-- =========================================================

create table if not exists public.lesson_grammar_intro (
  id uuid primary key default gen_random_uuid(),

  lesson_id uuid not null
    references public.lessons(id) on delete cascade,

  title text not null,
  short_text text,
  detailed_text text,

  image_url text,
  audio_url text,
  audio_duration_seconds integer,

  video_url text,
  video_duration_seconds integer,

  sort_order integer not null default 0,

  is_active boolean not null default true,
  version integer not null default 1,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique(lesson_id, sort_order)
);

-- =========================================================
-- COLLECTIONS
-- =========================================================

create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  language_id uuid
    references public.languages(id) on delete cascade,
  slug text unique not null,
  name text not null,
  description text,
  version integer not null default 1,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.collection_items (
  id uuid primary key default gen_random_uuid(),

  collection_id uuid not null
    references public.collections(id) on delete cascade,

  vocabulary_id uuid
    references public.vocabulary(id) on delete cascade,

  lesson_id uuid
    references public.lessons(id) on delete cascade,

  sort_order integer not null default 0,

  check (
    (vocabulary_id is not null and lesson_id is null)
    or
    (vocabulary_id is null and lesson_id is not null)
  )
);

-- =========================================================
-- GIFTS
-- =========================================================

create table if not exists public.gifts (
  id uuid primary key default gen_random_uuid(),
  language_id uuid
    references public.languages(id) on delete cascade,
  required_xp integer not null,
  title text not null,
  vocabulary_id uuid
    references public.vocabulary(id) on delete set null,
  image_url text,
  description text,
  is_active boolean not null default true
);

-- =========================================================
-- APP CONFIG
-- =========================================================

create table if not exists public.app_config (
  key text primary key,
  value jsonb not null,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);

-- =========================================================
-- APP RELEASE
-- =========================================================

create table if not exists public.app_release (
  id boolean primary key default true,

  major_version integer not null default 1,
  minor_version integer not null default 0,

  app_version text,

  minimum_supported_version text,

  release_notes text,

  updated_at timestamptz not null default now(),

  check(id = true),
  check(major_version >= 1),
  check(minor_version >= 0 and minor_version <= 99)
);

-- =========================================================
-- APP UPDATE MANIFEST
-- =========================================================

create table if not exists public.app_update_manifest (
  id boolean primary key default true,

  app_version text not null,

  major_version integer not null,
  minor_version integer not null,

  minimum_database_version text,

  download_url text,

  release_notes text,

  is_mandatory boolean not null default false,
  is_active boolean not null default true,

  published_at timestamptz,

  updated_at timestamptz not null default now(),

  check(id = true)
);

-- =========================================================
-- DATABASE RELEASE
-- =========================================================

create table if not exists public.database_release (
  id boolean primary key default true,

  major_version integer not null default 1,
  minor_version integer not null default 0,

  database_version text,

  release_name text,

  notes text,

  checksum text,

  published_at timestamptz,

  published_by uuid,

  check(id = true),
  check(major_version >= 1),
  check(minor_version >= 0 and minor_version <= 99)
);

-- =========================================================
-- DATABASE VERSIONS
-- =========================================================

create table if not exists public.database_versions (
  id bigint generated always as identity primary key,

  version integer unique not null,

  release_name text,

  checksum text,

  notes text,

  created_at timestamptz not null default now(),

  is_current boolean not null default false,

  major_version integer default 1,

  minor_version integer default 0,

  display_version text,

  published_at timestamptz,

  published_by uuid
);

-- =========================================================
-- SYNC CHANGES
-- =========================================================

create table if not exists public.sync_changes (
  id bigint generated always as identity primary key,

  db_version integer not null,

  entity_type text not null,

  entity_id uuid,

  operation text not null,

  payload jsonb,

  created_at timestamptz not null default now(),

  check(operation in ('upsert', 'delete'))
);

-- =========================================================
-- USERS
-- =========================================================

create table if not exists public.profiles (
  id uuid primary key
    references auth.users(id) on delete cascade,

  display_name text,

  role text not null default 'user',

  xp integer not null default 0,

  current_level integer not null default 1,

  created_at timestamptz not null default now(),

  updated_at timestamptz not null default now(),

  check(role in ('user', 'admin'))
);

create table if not exists public.user_progress (
  user_id uuid not null
    references auth.users(id) on delete cascade,

  lesson_id uuid not null
    references public.lessons(id) on delete cascade,

  completed boolean not null default false,

  best_score integer not null default 0,

  attempts integer not null default 0,

  updated_at timestamptz not null default now(),

  primary key(user_id, lesson_id)
);

create table if not exists public.user_vocabulary (
  user_id uuid not null
    references auth.users(id) on delete cascade,

  vocabulary_id uuid not null
    references public.vocabulary(id) on delete cascade,

  unlocked_at timestamptz not null default now(),

  mastery numeric(5,2) not null default 0,

  primary key(user_id, vocabulary_id)
);

create table if not exists public.user_gifts (
  user_id uuid not null
    references auth.users(id) on delete cascade,

  gift_id uuid not null
    references public.gifts(id) on delete cascade,

  unlocked_at timestamptz not null default now(),

  claimed_at timestamptz,

  primary key(user_id, gift_id)
);

-- =========================================================
-- INDEXES
-- =========================================================

create index if not exists idx_vocab_language
  on public.vocabulary(language_id);

create index if not exists idx_lessons_order
  on public.lessons(language_id, order_index);

create index if not exists idx_lesson_grammar_intro_lesson
  on public.lesson_grammar_intro(lesson_id);

create index if not exists idx_sync_version
  on public.sync_changes(db_version);

create unique index if not exists
  collection_items_collection_lesson_idx
  on public.collection_items(collection_id, lesson_id);

create unique index if not exists
  collection_items_collection_vocab_idx
  on public.collection_items(collection_id, vocabulary_id);

-- =========================================================
-- PROFILE AUTO-CREATE
-- =========================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    display_name
  )
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'display_name',
      new.email
    )
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

-- =========================================================
-- RLS
-- =========================================================

alter table public.languages enable row level security;
alter table public.vocabulary enable row level security;
alter table public.word_forms enable row level security;
alter table public.word_relations enable row level security;
alter table public.grammar enable row level security;
alter table public.sentence_patterns enable row level security;
alter table public.lessons enable row level security;
alter table public.lesson_words enable row level security;
alter table public.valid_sentences enable row level security;
alter table public.lesson_grammar_intro enable row level security;
alter table public.collections enable row level security;
alter table public.collection_items enable row level security;
alter table public.gifts enable row level security;
alter table public.app_config enable row level security;
alter table public.app_release enable row level security;
alter table public.app_update_manifest enable row level security;
alter table public.database_release enable row level security;
alter table public.database_versions enable row level security;
alter table public.sync_changes enable row level security;
alter table public.profiles enable row level security;
alter table public.user_progress enable row level security;
alter table public.user_vocabulary enable row level security;
alter table public.user_gifts enable row level security;

-- =========================================================
-- REMOVE EXISTING PUBLIC POLICIES
-- =========================================================

do $$
declare
  r record;
begin
  for r in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
  loop
    execute format(
      'drop policy if exists %I on public.%I',
      r.policyname,
      r.tablename
    );
  end loop;
end
$$;

-- =========================================================
-- ADMIN FUNCTION
-- =========================================================

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

-- =========================================================
-- ADMIN POLICIES
-- =========================================================

create policy "admin languages"
on public.languages
for all
to authenticated
using (is_admin())
with check (is_admin());

create policy "admin vocabulary"
on public.vocabulary
for all
to authenticated
using (is_admin())
with check (is_admin());

create policy "admin word forms"
on public.word_forms
for all
to authenticated
using (is_admin())
with check (is_admin());

create policy "admin word relations"
on public.word_relations
for all
to authenticated
using (is_admin())
with check (is_admin());

create policy "admin grammar"
on public.grammar
for all
to authenticated
using (is_admin())
with check (is_admin());

create policy "admin patterns"
on public.sentence_patterns
for all
to authenticated
using (is_admin())
with check (is_admin());

create policy "admin lessons"
on public.lessons
for all
to authenticated
using (is_admin())
with check (is_admin());

create policy "admin lesson words"
on public.lesson_words
for all
to authenticated
using (is_admin())
with check (is_admin());

create policy "admin valid sentences"
on public.valid_sentences
for all
to authenticated
using (is_admin())
with check (is_admin());

create policy "admin grammar intro"
on public.lesson_grammar_intro
for all
to authenticated
using (is_admin())
with check (is_admin());

create policy "admin collections"
on public.collections
for all
to authenticated
using (is_admin())
with check (is_admin());

create policy "admin collection items"
on public.collection_items
for all
to authenticated
using (is_admin())
with check (is_admin());

create policy "admin gifts"
on public.gifts
for all
to authenticated
using (is_admin())
with check (is_admin());

create policy "admin app config"
on public.app_config
for all
to authenticated
using (is_admin())
with check (is_admin());

create policy "admin app release"
on public.app_release
for all
to authenticated
using (is_admin())
with check (is_admin());

create policy "admin app update manifest"
on public.app_update_manifest
for all
to authenticated
using (is_admin())
with check (is_admin());

create policy "admin database release"
on public.database_release
for all
to authenticated
using (is_admin())
with check (is_admin());

create policy "admin database versions"
on public.database_versions
for all
to authenticated
using (is_admin())
with check (is_admin());

create policy "admin sync changes"
on public.sync_changes
for all
to authenticated
using (is_admin())
with check (is_admin());

create policy "admin profiles"
on public.profiles
for select
to authenticated
using (auth.uid() = id or is_admin());

-- =========================================================
-- PUBLIC READ POLICIES
-- =========================================================

create policy "public languages"
on public.languages
for select
to anon, authenticated
using (is_active = true);

create policy "public vocabulary"
on public.vocabulary
for select
to anon, authenticated
using (is_active = true);

create policy "public word forms"
on public.word_forms
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.vocabulary v
    where v.id = vocabulary_id
      and v.is_active = true
  )
);

create policy "public word relations"
on public.word_relations
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.vocabulary v
    where v.id = from_word_id
      and v.is_active = true
  )
  and
  exists (
    select 1
    from public.vocabulary v
    where v.id = to_word_id
      and v.is_active = true
  )
);

create policy "public grammar"
on public.grammar
for select
to anon, authenticated
using (is_active = true);

create policy "public patterns"
on public.sentence_patterns
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.grammar g
    where g.id = grammar_id
      and g.is_active = true
  )
);

create policy "public lessons"
on public.lessons
for select
to anon, authenticated
using (is_published = true);

create policy "public lesson words"
on public.lesson_words
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.lessons l
    where l.id = lesson_id
      and l.is_published = true
  )
);

create policy "public approved sentences"
on public.valid_sentences
for select
to anon, authenticated
using (is_approved = true);

create policy "public grammar intro"
on public.lesson_grammar_intro
for select
to anon, authenticated
using (
  is_active = true
  and exists (
    select 1
    from public.lessons l
    where l.id = lesson_id
      and l.is_published = true
  )
);

create policy "public collections"
on public.collections
for select
to anon, authenticated
using (is_published = true);

create policy "public collection items"
on public.collection_items
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.collections c
    where c.id = collection_id
      and c.is_published = true
  )
);

create policy "public gifts"
on public.gifts
for select
to anon, authenticated
using (is_active = true);

create policy "public config"
on public.app_config
for select
to anon, authenticated
using (true);

create policy "public app release"
on public.app_release
for select
to anon, authenticated
using (true);

create policy "public app update manifest"
on public.app_update_manifest
for select
to anon, authenticated
using (is_active = true);

create policy "public database release"
on public.database_release
for select
to anon, authenticated
using (true);

create policy "public current version"
on public.database_versions
for select
to anon, authenticated
using (is_current = true);

-- =========================================================
-- USER POLICIES
-- =========================================================

create policy "users own profile"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

create policy "users update own profile"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "users own progress"
on public.user_progress
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "users own vocabulary"
on public.user_vocabulary
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "users own gifts"
on public.user_gifts
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
