create extension if not exists pgcrypto;

-- =========================================================
-- CONTENT
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

create table if not exists public.vocabulary (
  id uuid primary key default gen_random_uuid(),
  language_id uuid not null references public.languages(id) on delete cascade,
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
  vocabulary_id uuid not null references public.vocabulary(id) on delete cascade,
  form_type text not null,
  form text not null,
  unique(vocabulary_id, form_type)
);

create table if not exists public.word_relations (
  id uuid primary key default gen_random_uuid(),
  from_word_id uuid not null references public.vocabulary(id) on delete cascade,
  to_word_id uuid not null references public.vocabulary(id) on delete cascade,
  relation_type text not null,
  weight numeric(5,2) not null default 1,
  unique(from_word_id, to_word_id, relation_type)
);

create table if not exists public.grammar (
  id uuid primary key default gen_random_uuid(),
  language_id uuid not null references public.languages(id) on delete cascade,
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
  grammar_id uuid not null references public.grammar(id) on delete cascade,
  code text not null,
  name text not null,
  slots jsonb not null,
  rules jsonb not null default '{}'::jsonb,
  unique(grammar_id, code)
);

create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  language_id uuid not null references public.languages(id) on delete cascade,
  grammar_id uuid references public.grammar(id) on delete set null,
  pattern_id uuid references public.sentence_patterns(id) on delete set null,
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
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  vocabulary_id uuid not null references public.vocabulary(id) on delete cascade,
  role text,
  sort_order integer not null default 0,
  primary key(lesson_id, vocabulary_id)
);

create table if not exists public.valid_sentences (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  tokens jsonb not null,
  sentence_text text not null,
  source text not null default 'admin',
  confidence numeric(5,4),
  is_approved boolean not null default false,
  created_at timestamptz not null default now(),
  unique(lesson_id, sentence_text)
);

create table if not exists public.lesson_grammar_intro (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons(id) on delete cascade,
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

create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  language_id uuid references public.languages(id) on delete cascade,
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
  collection_id uuid not null references public.collections(id) on delete cascade,
  vocabulary_id uuid references public.vocabulary(id) on delete cascade,
  lesson_id uuid references public.lessons(id) on delete cascade,
  sort_order integer not null default 0,
  check (
    (vocabulary_id is not null and lesson_id is null)
    or
    (vocabulary_id is null and lesson_id is not null)
  )
);

create table if not exists public.gifts (
  id uuid primary key default gen_random_uuid(),
  language_id uuid references public.languages(id) on delete cascade,
  required_xp integer not null,
  title text not null,
  vocabulary_id uuid references public.vocabulary(id) on delete set null,
  image_url text,
  description text,
  is_active boolean not null default true
);

-- =========================================================
-- APP / RELEASE / SYNC
-- =========================================================

create table if not exists public.app_config (
  key text primary key,
  value jsonb not null,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);

create table if not exists public.app_release (
  id boolean primary key default true,
  major_version integer not null default 1,
  minor_version integer not null default 0,
  app_version text generated always as (
    major_version::text || '.' || lpad(minor_version::text, 2, '0')
  ) stored,
  minimum_supported_version text,
  release_notes text,
  updated_at timestamptz not null default now(),
  check(id = true),
  check(major_version >= 1),
  check(minor_version between 0 and 99)
);

create table if not exists public.app_update_manifest (
  id boolean primary key default true,
  major_version integer not null default 1,
  minor_version integer not null default 0,
  app_version text generated always as (
    major_version::text || '.' || lpad(minor_version::text, 2, '0')
  ) stored,
  minimum_database_version text not null default '1.00',
  download_url text,
  release_notes text,
  is_mandatory boolean not null default false,
  is_active boolean not null default true,
  published_at timestamptz,
  updated_at timestamptz not null default now(),
  check(id = true),
  check(major_version >= 1),
  check(minor_version between 0 and 99)
);

create table if not exists public.database_release (
  id boolean primary key default true,
  major_version integer not null default 1,
  minor_version integer not null default 0,
  database_version text generated always as (
    major_version::text || '.' || lpad(minor_version::text, 2, '0')
  ) stored,
  release_name text,
  notes text,
  checksum text,
  published_at timestamptz,
  published_by uuid,
  updated_at timestamptz not null default now(),
  check(id = true),
  check(major_version >= 1),
  check(minor_version between 0 and 99)
);

create table if not exists public.database_versions (
  id bigint generated always as identity primary key,
  major_version integer not null default 1,
  minor_version integer not null default 0,
  version integer generated always as (major_version * 100 + minor_version) stored unique,
  display_version text generated always as (
    major_version::text || '.' || lpad(minor_version::text, 2, '0')
  ) stored,
  release_name text,
  checksum text,
  notes text,
  created_at timestamptz not null default now(),
  is_current boolean not null default false,
  published_at timestamptz,
  published_by uuid,
  check(major_version >= 1),
  check(minor_version between 0 and 99)
);

create table if not exists public.sync_changes (
  id bigint generated always as identity primary key,
  db_version integer not null,
  entity_type text not null,
  entity_id uuid,
  operation text not null check(operation in ('upsert', 'delete')),
  payload jsonb,
  created_at timestamptz not null default now()
);

-- =========================================================
-- USERS
-- =========================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'user',
  xp integer not null default 0,
  current_level integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(role in ('user', 'admin'))
);

create table if not exists public.user_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  completed boolean not null default false,
  best_score integer not null default 0,
  attempts integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key(user_id, lesson_id)
);

create table if not exists public.user_vocabulary (
  user_id uuid not null references auth.users(id) on delete cascade,
  vocabulary_id uuid not null references public.vocabulary(id) on delete cascade,
  unlocked_at timestamptz not null default now(),
  mastery numeric(5,2) not null default 0,
  primary key(user_id, vocabulary_id)
);

create table if not exists public.user_gifts (
  user_id uuid not null references auth.users(id) on delete cascade,
  gift_id uuid not null references public.gifts(id) on delete cascade,
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

create index if not exists idx_lesson_words_lesson
  on public.lesson_words(lesson_id);

create index if not exists idx_lesson_grammar_intro_lesson
  on public.lesson_grammar_intro(lesson_id);

create index if not exists idx_collection_items_collection
  on public.collection_items(collection_id);

create index if not exists idx_sync_version
  on public.sync_changes(db_version);

create index if not exists idx_database_versions_current
  on public.database_versions(is_current);

create unique index if not exists collection_items_collection_lesson_unique_idx
  on public.collection_items(collection_id, lesson_id)
  where lesson_id is not null;

create unique index if not exists collection_items_collection_vocab_unique_idx
  on public.collection_items(collection_id, vocabulary_id)
  where vocabulary_id is not null;

-- =========================================================
-- USER / ADMIN FUNCTIONS
-- =========================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles(id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', new.email)
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

do $$
declare r record;
begin
  for r in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
  loop
    execute format(
      'drop policy if exists %I on public.%I',
      r.policyname, r.tablename
    );
  end loop;
end
$$;

-- =========================================================
-- ADMIN POLICIES
-- =========================================================

create policy "admin languages"
on public.languages for all to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy "admin vocabulary"
on public.vocabulary for all to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy "admin word forms"
on public.word_forms for all to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy "admin word relations"
on public.word_relations for all to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy "admin grammar"
on public.grammar for all to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy "admin patterns"
on public.sentence_patterns for all to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy "admin lessons"
on public.lessons for all to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy "admin lesson words"
on public.lesson_words for all to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy "admin valid sentences"
on public.valid_sentences for all to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy "admin grammar intro"
on public.lesson_grammar_intro for all to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy "admin collections"
on public.collections for all to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy "admin collection items"
on public.collection_items for all to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy "admin gifts"
on public.gifts for all to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy "admin app config"
on public.app_config for all to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy "admin app release"
on public.app_release for all to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy "admin app update manifest"
on public.app_update_manifest for all to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy "admin database release"
on public.database_release for all to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy "admin database versions"
on public.database_versions for all to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy "admin sync changes"
on public.sync_changes for all to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy "admin profiles"
on public.profiles for all to authenticated
using (auth.uid() = id or public.is_admin())
with check (auth.uid() = id or public.is_admin());

-- =========================================================
-- PUBLIC READ POLICIES
-- =========================================================

create policy "public languages"
on public.languages for select to anon, authenticated
using (is_active = true);

create policy "public vocabulary"
on public.vocabulary for select to anon, authenticated
using (is_active = true);

create policy "public word forms"
on public.word_forms for select to anon, authenticated
using (
  exists (
    select 1 from public.vocabulary v
    where v.id = vocabulary_id and v.is_active = true
  )
);

create policy "public word relations"
on public.word_relations for select to anon, authenticated
using (
  exists (
    select 1 from public.vocabulary v
    where v.id = from_word_id and v.is_active = true
  )
  and exists (
    select 1 from public.vocabulary v
    where v.id = to_word_id and v.is_active = true
  )
);

create policy "public grammar"
on public.grammar for select to anon, authenticated
using (is_active = true);

create policy "public patterns"
on public.sentence_patterns for select to anon, authenticated
using (
  exists (
    select 1 from public.grammar g
    where g.id = grammar_id and g.is_active = true
  )
);

create policy "public lessons"
on public.lessons for select to anon, authenticated
using (is_published = true);

create policy "public lesson words"
on public.lesson_words for select to anon, authenticated
using (
  exists (
    select 1 from public.lessons l
    where l.id = lesson_id and l.is_published = true
  )
);

create policy "public approved sentences"
on public.valid_sentences for select to anon, authenticated
using (is_approved = true);

create policy "public grammar intro"
on public.lesson_grammar_intro for select to anon, authenticated
using (
  is_active = true
  and exists (
    select 1 from public.lessons l
    where l.id = lesson_id and l.is_published = true
  )
);

create policy "public collections"
on public.collections for select to anon, authenticated
using (is_published = true);

create policy "public collection items"
on public.collection_items for select to anon, authenticated
using (
  exists (
    select 1 from public.collections c
    where c.id = collection_id and c.is_published = true
  )
);

create policy "public gifts"
on public.gifts for select to anon, authenticated
using (is_active = true);

create policy "public config"
on public.app_config for select to anon, authenticated
using (true);

create policy "public app release"
on public.app_release for select to anon, authenticated
using (true);

create policy "public app update manifest"
on public.app_update_manifest for select to anon, authenticated
using (is_active = true);

create policy "public database release"
on public.database_release for select to anon, authenticated
using (true);

create policy "public current version"
on public.database_versions for select to anon, authenticated
using (is_current = true);

-- =========================================================
-- USER POLICIES
-- =========================================================

create policy "users own profile"
on public.profiles for select to authenticated
using (auth.uid() = id or public.is_admin());

create policy "users update own profile"
on public.profiles for update to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "users own progress"
on public.user_progress for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "users own vocabulary"
on public.user_vocabulary for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "users own gifts"
on public.user_gifts for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- =========================================================
-- INITIAL RELEASE STATE
-- IMPORTANT: fresh database starts at 1.00.
-- First content publish moves it to 1.01.
-- =========================================================

insert into public.app_release (
  id, major_version, minor_version,
  minimum_supported_version, release_notes
)
values (
  true, 1, 0, null,
  'SentenceQuest initial app release'
)
on conflict (id) do update set
  major_version = excluded.major_version,
  minor_version = excluded.minor_version,
  minimum_supported_version = excluded.minimum_supported_version,
  release_notes = excluded.release_notes,
  updated_at = now();

insert into public.app_update_manifest (
  id, major_version, minor_version,
  minimum_database_version, download_url,
  release_notes, is_mandatory, is_active, published_at
)
values (
  true, 1, 0, '1.00', null,
  'SentenceQuest initial app release',
  false, true, now()
)
on conflict (id) do update set
  major_version = excluded.major_version,
  minor_version = excluded.minor_version,
  minimum_database_version = excluded.minimum_database_version,
  download_url = excluded.download_url,
  release_notes = excluded.release_notes,
  is_mandatory = excluded.is_mandatory,
  is_active = excluded.is_active,
  published_at = excluded.published_at,
  updated_at = now();

insert into public.database_release (
  id, major_version, minor_version,
  release_name, notes, checksum, published_at, published_by
)
values (
  true, 1, 0,
  'Initial Database',
  'SentenceQuest database version 1.00',
  'initial-1.00',
  now(), null
)
on conflict (id) do update set
  major_version = excluded.major_version,
  minor_version = excluded.minor_version,
  release_name = excluded.release_name,
  notes = excluded.notes,
  checksum = excluded.checksum,
  published_at = excluded.published_at,
  published_by = excluded.published_by,
  updated_at = now();

update public.database_versions
set is_current = false
where is_current = true;

insert into public.database_versions (
  major_version, minor_version,
  release_name, checksum, notes,
  is_current, published_at, published_by
)
values (
  1, 0,
  'Initial Database',
  'initial-1.00',
  'SentenceQuest database version 1.00',
  true, now(), null
)
on conflict (version) do update set
  major_version = excluded.major_version,
  minor_version = excluded.minor_version,
  release_name = excluded.release_name,
  checksum = excluded.checksum,
  notes = excluded.notes,
  is_current = true,
  published_at = excluded.published_at,
  published_by = excluded.published_by;

-- =========================================================
-- DONE
-- =========================================================
-- =========================================================
-- SENTENCE QUEST
-- TEST STORY SEED
-- =========================================================
-- این فایل فقط برای تست اولیه Game است.
-- فعلاً سیستم رسمی World Publishing را دور نمی‌زند
-- برای production استفاده نشود.
-- =========================================================

do $$
declare
  v_language_id uuid;
  v_destination_id uuid;

  v_agency_location_id uuid;
  v_airport_location_id uuid;

  v_agent_npc_id uuid;

  v_node_agency_id uuid;
  v_node_airport_id uuid;

  v_quest_id uuid;

  v_lesson_id uuid;
begin

  -- =======================================================
  -- LANGUAGE
  -- =======================================================

  select id
  into v_language_id
  from public.languages
  where code = 'en'
  limit 1;

  if v_language_id is null then
    raise exception
      'English language (code=en) was not found. Import/publish the English collection first.';
  end if;


  -- =======================================================
  -- DESTINATION
  -- =======================================================

  insert into public.destinations (
    code,
    name,
    language_id,
    calendar_type,
    timezone,
    culture_notes,
    is_active,
    version
  )
  values (
    'US',
    'United States',
    v_language_id,
    'gregorian',
    'America/New_York',
    'Prototype destination for SentenceQuest story testing.',
    true,
    1
  )
  on conflict (code)
  do update set
    name = excluded.name,
    language_id = excluded.language_id,
    calendar_type = excluded.calendar_type,
    timezone = excluded.timezone,
    is_active = true,
    updated_at = now()
  returning id
  into v_destination_id;


  -- =======================================================
  -- LOCATION 1 — TRAVEL AGENCY
  -- =======================================================

  insert into public.locations (
    destination_id,
    code,
    name,
    location_type,
    description,
    is_active
  )
  values (
    v_destination_id,
    'travel_agency',
    'Travel Agency',
    'service',
    'A small travel agency where your journey begins.',
    true
  )
  on conflict (
    destination_id,
    code
  )
  do update set
    name = excluded.name,
    description = excluded.description,
    is_active = true,
    updated_at = now()
  returning id
  into v_agency_location_id;


  -- =======================================================
  -- LOCATION 2 — AIRPORT
  -- =======================================================

  insert into public.locations (
    destination_id,
    code,
    name,
    location_type,
    description,
    is_active
  )
  values (
    v_destination_id,
    'airport',
    'International Airport',
    'airport',
    'The airport where you begin your trip.',
    true
  )
  on conflict (
    destination_id,
    code
  )
  do update set
    name = excluded.name,
    description = excluded.description,
    is_active = true,
    updated_at = now()
  returning id
  into v_airport_location_id;


  -- =======================================================
  -- NPC — TRAVEL AGENT
  -- =======================================================

  insert into public.npcs (
    destination_id,
    location_id,
    code,
    name,
    role,
    personality_notes,
    is_active
  )
  values (
    v_destination_id,
    v_agency_location_id,
    'travel_agent',
    'Emma',
    'Travel Agent',
    'Friendly, patient and helpful.',
    true
  )
  on conflict (
    destination_id,
    code
  )
  do update set
    location_id = excluded.location_id,
    name = excluded.name,
    role = excluded.role,
    personality_notes = excluded.personality_notes,
    is_active = true
  returning id
  into v_agent_npc_id;


  -- =======================================================
  -- NODE 1 — DAY 1 TRAVEL AGENCY
  -- =======================================================

  insert into public.story_nodes (
    destination_id,
    code,
    title,
    day_number,
    time_of_day,
    location_id,
    npc_id,
    node_type,
    description,
    is_start,
    is_active,
    is_published,
    version
  )
  values (
    v_destination_id,
    'day1_travel_agency',
    'Your Journey Begins',
    1,
    'morning',
    v_agency_location_id,
    v_agent_npc_id,
    'quest',
    'Your first morning begins at a travel agency.',
    true,
    true,
    true,
    1
  )
  on conflict (
    destination_id,
    code
  )
  do update set
    title = excluded.title,
    day_number = excluded.day_number,
    time_of_day = excluded.time_of_day,
    location_id = excluded.location_id,
    npc_id = excluded.npc_id,
    node_type = excluded.node_type,
    description = excluded.description,
    is_start = true,
    is_active = true,
    is_published = true,
    updated_at = now()
  returning id
  into v_node_agency_id;


  -- =======================================================
  -- NODE 2 — DAY 1 AIRPORT
  -- =======================================================

  insert into public.story_nodes (
    destination_id,
    code,
    title,
    day_number,
    time_of_day,
    location_id,
    npc_id,
    node_type,
    description,
    is_start,
    is_active,
    is_published,
    version
  )
  values (
    v_destination_id,
    'day1_airport',
    'At the Airport',
    1,
    'afternoon',
    v_airport_location_id,
    null,
    'dialogue',
    'You arrive at the airport with your ticket.',
    false,
    true,
    true,
    1
  )
  on conflict (
    destination_id,
    code
  )
  do update set
    title = excluded.title,
    day_number = excluded.day_number,
    time_of_day = excluded.time_of_day,
    location_id = excluded.location_id,
    npc_id = excluded.npc_id,
    node_type = excluded.node_type,
    description = excluded.description,
    is_start = false,
    is_active = true,
    is_published = true,
    updated_at = now()
  returning id
  into v_node_airport_id;


  -- =======================================================
  -- DIALOGUE — TRAVEL AGENCY
  -- =======================================================

  delete from public.dialogue_lines
  where story_node_id = v_node_agency_id;


  insert into public.dialogue_lines (
    story_node_id,
    npc_id,
    speaker_type,
    line_order,
    target_text,
    native_translation
  )
  values
  (
    v_node_agency_id,
    v_agent_npc_id,
    'narrator',
    1,
    'This is the beginning of your journey.',
    'این آغاز سفر توست.'
  ),
  (
    v_node_agency_id,
    v_agent_npc_id,
    'npc',
    2,
    'Good morning! How can I help you?',
    'صبح بخیر! چطور می‌توانم کمکتان کنم؟'
  ),
  (
    v_node_agency_id,
    v_agent_npc_id,
    'player',
    3,
    'I need a ticket.',
    'من یک بلیت لازم دارم.'
  );


  -- =======================================================
  -- DIALOGUE — AIRPORT
  -- =======================================================

  delete from public.dialogue_lines
  where story_node_id = v_node_airport_id;


  insert into public.dialogue_lines (
    story_node_id,
    npc_id,
    speaker_type,
    line_order,
    target_text,
    native_translation
  )
  values
  (
    v_node_airport_id,
    null,
    'narrator',
    1,
    'You arrive at the airport.',
    'به فرودگاه می‌رسی.'
  ),
  (
    v_node_airport_id,
    null,
    'narrator',
    2,
    'Your adventure is about to begin.',
    'ماجراجویی تو در آستانه شروع است.'
  );


  -- =======================================================
  -- STORY CHOICE
  -- =======================================================

  delete from public.story_choices
  where from_node_id = v_node_agency_id;


  insert into public.story_choices (
    from_node_id,
    to_node_id,
    choice_text,
    sort_order
  )
  values (
    v_node_agency_id,
    v_node_airport_id,
    'Go to the airport',
    1
  )
  on conflict (
    from_node_id,
    to_node_id
  )
  do update set
    choice_text = excluded.choice_text,
    sort_order = excluded.sort_order;


  -- =======================================================
  -- FIND EXISTING LESSON
  -- =======================================================

  select id
  into v_lesson_id
  from public.lessons
  where slug = 'a1-food-001'
  limit 1;

  if v_lesson_id is null then
    raise exception
      'Lesson a1-food-001 was not found. Import the existing collection first.';
  end if;


  -- =======================================================
  -- QUEST
  -- =======================================================

  insert into public.quests (
    destination_id,
    story_node_id,
    code,
    title,
    description,
    level,
    xp_reward,
    is_repeatable,
    is_published,
    version
  )
  values (
    v_destination_id,
    v_node_agency_id,
    'get_your_ticket',
    'Get Your Ticket',
    'Complete your first language challenge before leaving the travel agency.',
    'A1',
    20,
    false,
    true,
    1
  )
  on conflict (code)
  do update set
    destination_id = excluded.destination_id,
    story_node_id = excluded.story_node_id,
    title = excluded.title,
    description = excluded.description,
    level = excluded.level,
    xp_reward = excluded.xp_reward,
    is_repeatable = false,
    is_published = true,
    updated_at = now()
  returning id
  into v_quest_id;


  -- =======================================================
  -- QUEST STEP
  -- =======================================================

  delete from public.quest_steps
  where quest_id = v_quest_id;


  insert into public.quest_steps (
    quest_id,
    step_order,
    step_type,
    lesson_id,
    prompt_native,
    prompt_target
  )
  values (
    v_quest_id,
    1,
    'sentence',
    v_lesson_id,
    'جمله را بساز.',
    'Build the sentence.'
  );


  -- =======================================================
  -- RESET START NODE STATE
  -- =======================================================

  update public.story_nodes
  set
    is_start = false,
    updated_at = now()
  where destination_id = v_destination_id
    and id <> v_node_agency_id;


  update public.story_nodes
  set
    is_start = true,
    is_published = true,
    is_active = true,
    updated_at = now()
  where id = v_node_agency_id;


  raise notice
    'SentenceQuest test story created successfully. Destination ID: %',
    v_destination_id;

end
$$;
