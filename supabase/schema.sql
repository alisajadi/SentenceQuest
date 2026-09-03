create extension if not exists pgcrypto;

-- =========================================================
-- LANGUAGE CONTENT
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
  minimum_database_version text,
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
  check(id = true),
  check(major_version >= 1),
  check(minor_version between 0 and 99)
);

create table if not exists public.database_versions (
  id bigint generated always as identity primary key,
  version integer unique not null,
  release_name text,
  checksum text,
  notes text,
  created_at timestamptz not null default now(),
  is_current boolean not null default false,
  major_version integer not null default 1,
  minor_version integer not null default 0,
  display_version text generated always as (
    major_version::text || '.' || lpad(minor_version::text, 2, '0')
  ) stored,
  published_at timestamptz,
  published_by uuid
);

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
-- USER ACCOUNT / PROGRESS
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
-- FUTURE-PROOF WORLD FOUNDATION
-- These tables are intentionally foundational, not the full
-- future game model. They keep language content separate from
-- world/story/player state so future systems do not require
-- redesigning lessons and vocabulary.
-- =========================================================

create table if not exists public.countries (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  native_name text,
  default_locale text,
  default_timezone text,
  metadata jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.worlds (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  description text,
  target_language_id uuid not null references public.languages(id) on delete restrict,
  country_id uuid references public.countries(id) on delete set null,
  locale text,
  culture_code text,
  calendar_type text not null default 'gregorian',
  metadata jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profile_language_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  native_language_id uuid references public.languages(id) on delete set null,
  target_world_id uuid references public.worlds(id) on delete set null,
  ui_language_id uuid references public.languages(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.player_worlds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  world_id uuid not null references public.worlds(id) on delete restrict,
  status text not null default 'active',
  life_date date not null default date '2026-01-01',
  current_time_of_day text not null default 'morning',
  current_scene_id uuid,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique(user_id, world_id),
  check(status in ('active', 'paused', 'completed')),
  check(current_time_of_day in ('morning', 'afternoon', 'evening', 'night'))
);

create table if not exists public.world_scenes (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.worlds(id) on delete cascade,
  parent_scene_id uuid references public.world_scenes(id) on delete set null,
  code text not null,
  name text not null,
  scene_type text not null default 'location',
  description text,
  metadata jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(world_id, code)
);

alter table public.player_worlds
  drop constraint if exists player_worlds_current_scene_id_fkey;

alter table public.player_worlds
  add constraint player_worlds_current_scene_id_fkey
  foreign key (current_scene_id)
  references public.world_scenes(id)
  on delete set null;

create table if not exists public.quests (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.worlds(id) on delete cascade,
  scene_id uuid references public.world_scenes(id) on delete set null,
  code text not null,
  title text not null,
  description text,
  quest_type text not null default 'narrative',
  sort_order integer not null default 0,
  prerequisites jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(world_id, code)
);

create table if not exists public.quest_steps (
  id uuid primary key default gen_random_uuid(),
  quest_id uuid not null references public.quests(id) on delete cascade,
  sort_order integer not null default 0,
  step_type text not null default 'interaction',
  title text,
  description text,
  lesson_id uuid references public.lessons(id) on delete set null,
  scene_id uuid references public.world_scenes(id) on delete set null,
  content jsonb not null default '{}'::jsonb,
  is_optional boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(quest_id, sort_order)
);

create table if not exists public.story_nodes (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.worlds(id) on delete cascade,
  scene_id uuid references public.world_scenes(id) on delete set null,
  code text not null,
  title text,
  body text,
  node_type text not null default 'scene',
  conditions jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(world_id, code)
);

create table if not exists public.story_edges (
  id uuid primary key default gen_random_uuid(),
  from_node_id uuid not null references public.story_nodes(id) on delete cascade,
  to_node_id uuid not null references public.story_nodes(id) on delete cascade,
  choice_code text,
  choice_text text,
  conditions jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  unique(from_node_id, to_node_id, choice_code)
);

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.worlds(id) on delete cascade,
  scene_id uuid references public.world_scenes(id) on delete set null,
  quest_id uuid references public.quests(id) on delete set null,
  story_node_id uuid references public.story_nodes(id) on delete set null,
  life_date date not null,
  time_of_day text not null default 'morning',
  title text not null,
  description text,
  event_type text not null default 'quest',
  metadata jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(time_of_day in ('morning', 'afternoon', 'evening', 'night'))
);

create table if not exists public.player_quest_progress (
  player_world_id uuid not null references public.player_worlds(id) on delete cascade,
  quest_id uuid not null references public.quests(id) on delete cascade,
  status text not null default 'available',
  current_step integer not null default 0,
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key(player_world_id, quest_id),
  check(status in ('locked', 'available', 'active', 'completed', 'failed'))
);

create table if not exists public.player_choices (
  id bigint generated always as identity primary key,
  player_world_id uuid not null references public.player_worlds(id) on delete cascade,
  story_node_id uuid references public.story_nodes(id) on delete set null,
  choice_code text not null,
  value jsonb,
  created_at timestamptz not null default now()
);

-- =========================================================
-- INDEXES
-- =========================================================

create index if not exists idx_vocab_language
  on public.vocabulary(language_id);

create index if not exists idx_vocab_active
  on public.vocabulary(language_id, is_active);

create index if not exists idx_lessons_order
  on public.lessons(language_id, order_index);

create index if not exists idx_lessons_published
  on public.lessons(language_id, is_published);

create index if not exists idx_lesson_grammar_intro_lesson
  on public.lesson_grammar_intro(lesson_id);

create index if not exists idx_collection_items_collection
  on public.collection_items(collection_id);

create index if not exists idx_sync_version
  on public.sync_changes(db_version);

create index if not exists idx_database_versions_current
  on public.database_versions(is_current);

create index if not exists idx_worlds_language
  on public.worlds(target_language_id);

create index if not exists idx_world_scenes_world
  on public.world_scenes(world_id, sort_order);

create index if not exists idx_quests_world
  on public.quests(world_id, sort_order);

create index if not exists idx_quest_steps_quest
  on public.quest_steps(quest_id, sort_order);

create index if not exists idx_story_nodes_world
  on public.story_nodes(world_id);

create index if not exists idx_calendar_world_date
  on public.calendar_events(world_id, life_date);

create index if not exists idx_player_worlds_user
  on public.player_worlds(user_id);

create index if not exists idx_player_quest_progress_world
  on public.player_quest_progress(player_world_id);

create unique index if not exists collection_items_collection_lesson_unique_idx
  on public.collection_items(collection_id, lesson_id)
  where lesson_id is not null;

create unique index if not exists collection_items_collection_vocab_unique_idx
  on public.collection_items(collection_id, vocabulary_id)
  where vocabulary_id is not null;

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
  insert into public.profiles (id, display_name)
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

alter table public.countries enable row level security;
alter table public.worlds enable row level security;
alter table public.profile_language_preferences enable row level security;
alter table public.player_worlds enable row level security;
alter table public.world_scenes enable row level security;
alter table public.quests enable row level security;
alter table public.quest_steps enable row level security;
alter table public.story_nodes enable row level security;
alter table public.story_edges enable row level security;
alter table public.calendar_events enable row level security;
alter table public.player_quest_progress enable row level security;
alter table public.player_choices enable row level security;

-- =========================================================
-- REMOVE EXISTING PUBLIC-SCHEMA POLICIES
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
-- ADMIN POLICIES
-- =========================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'languages','vocabulary','word_forms','word_relations',
    'grammar','sentence_patterns','lessons','lesson_words',
    'valid_sentences','lesson_grammar_intro','collections',
    'collection_items','gifts','app_config','app_release',
    'app_update_manifest','database_release','database_versions',
    'sync_changes','countries','worlds','quests','quest_steps',
    'story_nodes','story_edges','calendar_events'
  ]
  loop
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())',
      'admin_' || t,
      t
    );
  end loop;
end
$$;

create policy "admin profiles"
on public.profiles
for all to authenticated
using (auth.uid() = id or public.is_admin())
with check (auth.uid() = id or public.is_admin());

-- =========================================================
-- PUBLIC READ POLICIES
-- =========================================================

create policy "public languages"
on public.languages
for select to anon, authenticated
using (is_active = true);

create policy "public vocabulary"
on public.vocabulary
for select to anon, authenticated
using (is_active = true);

create policy "public word forms"
on public.word_forms
for select to anon, authenticated
using (
  exists (
    select 1 from public.vocabulary v
    where v.id = vocabulary_id and v.is_active = true
  )
);

create policy "public word relations"
on public.word_relations
for select to anon, authenticated
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
on public.grammar
for select to anon, authenticated
using (is_active = true);

create policy "public patterns"
on public.sentence_patterns
for select to anon, authenticated
using (
  exists (
    select 1 from public.grammar g
    where g.id = grammar_id and g.is_active = true
  )
);

create policy "public lessons"
on public.lessons
for select to anon, authenticated
using (is_published = true);

create policy "public lesson words"
on public.lesson_words
for select to anon, authenticated
using (
  exists (
    select 1 from public.lessons l
    where l.id = lesson_id and l.is_published = true
  )
);

create policy "public approved sentences"
on public.valid_sentences
for select to anon, authenticated
using (is_approved = true);

create policy "public grammar intro"
on public.lesson_grammar_intro
for select to anon, authenticated
using (
  is_active = true
  and exists (
    select 1 from public.lessons l
    where l.id = lesson_id and l.is_published = true
  )
);

create policy "public collections"
on public.collections
for select to anon, authenticated
using (is_published = true);

create policy "public collection items"
on public.collection_items
for select to anon, authenticated
using (
  exists (
    select 1 from public.collections c
    where c.id = collection_id and c.is_published = true
  )
);

create policy "public gifts"
on public.gifts
for select to anon, authenticated
using (is_active = true);

create policy "public config"
on public.app_config
for select to anon, authenticated
using (true);

create policy "public app release"
on public.app_release
for select to anon, authenticated
using (true);

create policy "public app update manifest"
on public.app_update_manifest
for select to anon, authenticated
using (is_active = true);

create policy "public database release"
on public.database_release
for select to anon, authenticated
using (true);

create policy "public current version"
on public.database_versions
for select to anon, authenticated
using (is_current = true);

create policy "public countries"
on public.countries
for select to anon, authenticated
using (is_active = true);

create policy "public worlds"
on public.worlds
for select to anon, authenticated
using (is_active = true);

create policy "public world scenes"
on public.world_scenes
for select to anon, authenticated
using (
  is_active = true
  and exists (
    select 1 from public.worlds w
    where w.id = world_id and w.is_active = true
  )
);

create policy "public quests"
on public.quests
for select to anon, authenticated
using (
  is_active = true
  and exists (
    select 1 from public.worlds w
    where w.id = world_id and w.is_active = true
  )
);

create policy "public quest steps"
on public.quest_steps
for select to anon, authenticated
using (
  exists (
    select 1
    from public.quests q
    where q.id = quest_id and q.is_active = true
  )
);

create policy "public story nodes"
on public.story_nodes
for select to anon, authenticated
using (
  is_active = true
  and exists (
    select 1 from public.worlds w
    where w.id = world_id and w.is_active = true
  )
);

create policy "public story edges"
on public.story_edges
for select to anon, authenticated
using (
  exists (
    select 1 from public.story_nodes n
    where n.id = from_node_id and n.is_active = true
  )
);

create policy "public calendar events"
on public.calendar_events
for select to anon, authenticated
using (
  is_active = true
  and exists (
    select 1 from public.worlds w
    where w.id = world_id and w.is_active = true
  )
);

-- =========================================================
-- USER POLICIES
-- =========================================================

create policy "users own profile"
on public.profiles
for select to authenticated
using (auth.uid() = id or public.is_admin());

create policy "users update own profile"
on public.profiles
for update to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "users own progress"
on public.user_progress
for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "users own vocabulary"
on public.user_vocabulary
for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "users own gifts"
on public.user_gifts
for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "users own language preferences"
on public.profile_language_preferences
for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "users own worlds"
on public.player_worlds
for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "users own quest progress"
on public.player_quest_progress
for all to authenticated
using (
  exists (
    select 1 from public.player_worlds pw
    where pw.id = player_world_id
      and pw.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.player_worlds pw
    where pw.id = player_world_id
      and pw.user_id = auth.uid()
  )
);

create policy "users own choices"
on public.player_choices
for all to authenticated
using (
  exists (
    select 1 from public.player_worlds pw
    where pw.id = player_world_id
      and pw.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.player_worlds pw
    where pw.id = player_world_id
      and pw.user_id = auth.uid()
  )
);

-- =========================================================
-- INITIAL RELEASE RECORDS
-- IMPORTANT:
-- Generated columns are never inserted explicitly.
-- Import does NOT increment database version.
-- Initial database release is 1.00.
-- The first Publish creates 1.01.
-- =========================================================

insert into public.app_release (
  id,
  major_version,
  minor_version,
  minimum_supported_version,
  release_notes
)
values (
  true,
  1,
  0,
  null,
  'SentenceQuest initial app release'
)
on conflict (id) do nothing;

insert into public.app_update_manifest (
  id,
  major_version,
  minor_version,
  minimum_database_version,
  download_url,
  release_notes,
  is_mandatory,
  is_active,
  published_at
)
values (
  true,
  1,
  0,
  '1.00',
  null,
  'SentenceQuest initial app release',
  false,
  true,
  now()
)
on conflict (id) do nothing;

insert into public.database_release (
  id,
  major_version,
  minor_version,
  release_name,
  notes,
  checksum,
  published_at,
  published_by
)
values (
  true,
  1,
  0,
  'Initial Database',
  'SentenceQuest database structure initialized.',
  'initial',
  now(),
  null
)
on conflict (id) do nothing;

insert into public.database_versions (
  version,
  major_version,
  minor_version,
  release_name,
  notes,
  checksum,
  is_current,
  published_at,
  published_by
)
values (
  100,
  1,
  0,
  'Initial Database',
  'SentenceQuest database structure initialized.',
  'initial',
  true,
  now(),
  null
)
on conflict (version) do update set
  major_version = excluded.major_version,
  minor_version = excluded.minor_version,
  release_name = excluded.release_name,
  notes = excluded.notes,
  checksum = excluded.checksum,
  is_current = true,
  published_at = excluded.published_at,
  published_by = excluded.published_by;

-- =========================================================
-- DONE
-- =========================================================
