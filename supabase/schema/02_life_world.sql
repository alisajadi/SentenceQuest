-- =========================================================
-- SENTENCE QUEST — LIFE WORLD ENGINE (v2 additive schema)
-- =========================================================
-- Apply this AFTER supabase/schema.sql (the original file is untouched).
-- Safe to re-run: everything uses "if not exists" / "drop policy if exists".
--
-- DESIGN PRINCIPLE:
-- This file does NOT rebuild the learning engine. It reuses
-- public.lessons + public.lesson_words + public.valid_sentences
-- (your existing sentence-building + Creativity Reward system)
-- as the mechanic *inside* quest steps and dialogue lines.
-- This file only adds the STORY / WORLD / TIME layer on top:
--   destinations -> locations -> npcs
--   story_nodes  -> story_choices   (branching narrative graph)
--   quests       -> quest_steps     (quest wraps one or more lessons)
--   dialogue_lines                  (NPC/player lines inside a node)
--   user_time_state                 (Real Date vs Life Date)
--   calendar_events + cultural_calendar_events   (Life Journal)
--   user_preferences                (behavioral personalization)
--   user_story_progress / user_story_choices_made / user_quest_progress
-- =========================================================

create extension if not exists pgcrypto;

-- =========================================================
-- WORLD CONTENT
-- =========================================================

create table if not exists public.destinations (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,                 -- e.g. 'US'
  name text not null,                        -- e.g. 'United States'
  language_id uuid references public.languages(id) on delete set null,
  calendar_type text not null default 'gregorian',
  timezone text,
  culture_notes text,
  is_active boolean not null default true,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  destination_id uuid not null references public.destinations(id) on delete cascade,
  code text not null,                        -- e.g. 'travel_agency', 'airport', 'hotel_lobby'
  name text not null,
  location_type text not null default 'generic',
  description text,
  image_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(destination_id, code)
);

create table if not exists public.npcs (
  id uuid primary key default gen_random_uuid(),
  destination_id uuid not null references public.destinations(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  code text not null,
  name text not null,
  role text,
  avatar_url text,
  personality_notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(destination_id, code)
);

-- =========================================================
-- BRANCHING STORY GRAPH
-- =========================================================

create table if not exists public.story_nodes (
  id uuid primary key default gen_random_uuid(),
  destination_id uuid not null references public.destinations(id) on delete cascade,
  code text not null,                        -- e.g. 'day1_travel_agency'
  title text not null,
  day_number integer,                        -- null = not tied to a fixed day yet
  time_of_day text check (time_of_day in ('morning','afternoon','evening','night')),
  location_id uuid references public.locations(id) on delete set null,
  npc_id uuid references public.npcs(id) on delete set null,
  node_type text not null default 'quest'
    check (node_type in ('quest','dialogue','choice','cutscene','free_life')),
  description text,
  is_start boolean not null default false,
  is_active boolean not null default true,
  is_published boolean not null default false,
  version integer not null default 1,
  editor_x double precision,                 -- position on the visual Story Graph canvas
  editor_y double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(destination_id, code)
);

create table if not exists public.story_choices (
  id uuid primary key default gen_random_uuid(),
  from_node_id uuid not null references public.story_nodes(id) on delete cascade,
  to_node_id uuid not null references public.story_nodes(id) on delete cascade,
  choice_text text not null,
  requires_preference_key text,              -- e.g. 'social_style'
  requires_preference_value text,            -- e.g. 'outgoing'
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique(from_node_id, to_node_id)
);

-- =========================================================
-- QUESTS (wrap existing lessons in a story context)
-- =========================================================

create table if not exists public.quests (
  id uuid primary key default gen_random_uuid(),
  destination_id uuid not null references public.destinations(id) on delete cascade,
  story_node_id uuid references public.story_nodes(id) on delete set null,
  code text unique not null,                 -- e.g. 'get_boarding_pass'
  title text not null,
  description text,
  level text,
  xp_reward integer not null default 50,
  is_repeatable boolean not null default false,
  is_published boolean not null default false,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.quest_steps (
  id uuid primary key default gen_random_uuid(),
  quest_id uuid not null references public.quests(id) on delete cascade,
  step_order integer not null default 0,
  step_type text not null default 'sentence'
    check (step_type in (
      'sentence','dialogue','listening','reading',
      'multiple_choice','fill_blank','free_sentence'
    )),
  lesson_id uuid references public.lessons(id) on delete set null,
  dialogue_line_id uuid,                     -- fk added below (dialogue_lines defined after)
  prompt_native text,
  prompt_target text,
  media_url text,
  created_at timestamptz not null default now(),
  unique(quest_id, step_order)
);

-- =========================================================
-- DIALOGUE (lines inside a story node; may trigger a lesson)
-- =========================================================

create table if not exists public.dialogue_lines (
  id uuid primary key default gen_random_uuid(),
  story_node_id uuid not null references public.story_nodes(id) on delete cascade,
  npc_id uuid references public.npcs(id) on delete set null,
  speaker_type text not null default 'npc'
    check (speaker_type in ('npc','player','narrator')),
  line_order integer not null default 0,
  target_text text not null,
  native_translation text,
  audio_url text,
  lesson_id uuid references public.lessons(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(story_node_id, line_order)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'quest_steps_dialogue_line_fk'
  ) then
    alter table public.quest_steps
      add constraint quest_steps_dialogue_line_fk
      foreign key (dialogue_line_id) references public.dialogue_lines(id) on delete set null;
  end if;
end
$$;

-- =========================================================
-- TIME SYSTEM — Real Date vs Life Date
-- =========================================================

create table if not exists public.user_time_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  destination_id uuid references public.destinations(id) on delete set null,
  life_date date not null default current_date,
  life_day_number integer not null default 1,
  time_of_day text not null default 'morning'
    check (time_of_day in ('morning','afternoon','evening','night')),
  time_progression_mode text not null default 'on_login'
    check (time_progression_mode in ('on_login','real_time_sync','hybrid')),
  last_played_real_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================================================
-- CALENDAR / LIFE JOURNAL
-- =========================================================

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  life_date date not null,
  event_type text not null default 'story_event'
    check (event_type in ('quest_completed','story_event','cultural_holiday','system','custom')),
  title text not null,
  description text,
  related_quest_id uuid references public.quests(id) on delete set null,
  related_story_node_id uuid references public.story_nodes(id) on delete set null,
  icon_url text,
  is_future boolean not null default false,
  created_at timestamptz not null default now()
);

-- Culture-wide recurring holidays per destination (e.g. Christmas, New Year's Day)
create table if not exists public.cultural_calendar_events (
  id uuid primary key default gen_random_uuid(),
  destination_id uuid not null references public.destinations(id) on delete cascade,
  month integer not null check (month between 1 and 12),
  day integer not null check (day between 1 and 31),
  title text not null,
  description text,
  is_recurring boolean not null default true,
  is_active boolean not null default true,
  unique(destination_id, month, day, title)
);

-- =========================================================
-- PERSONALIZATION (behavioral, not self-reported psychology)
-- =========================================================

create table if not exists public.user_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  preference_key text not null,              -- e.g. 'social_style','home_type','job_type','pace'
  preference_value text not null,
  source text not null default 'explicit_choice'
    check (source in ('explicit_choice','inferred_behavior')),
  recorded_at timestamptz not null default now(),
  unique(user_id, preference_key)
);

-- =========================================================
-- USER PROGRESS THROUGH THE STORY WORLD
-- =========================================================

create table if not exists public.user_story_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  destination_id uuid not null references public.destinations(id) on delete cascade,
  current_node_id uuid references public.story_nodes(id) on delete set null,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, destination_id)
);

create table if not exists public.user_story_choices_made (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  story_choice_id uuid not null references public.story_choices(id) on delete cascade,
  chosen_at timestamptz not null default now(),
  unique(user_id, story_choice_id)
);

create table if not exists public.user_quest_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  quest_id uuid not null references public.quests(id) on delete cascade,
  status text not null default 'available'
    check (status in ('locked','available','in_progress','completed')),
  started_at timestamptz,
  completed_at timestamptz,
  best_score integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, quest_id)
);

-- =========================================================
-- INDEXES
-- =========================================================

create index if not exists idx_locations_destination on public.locations(destination_id);
create index if not exists idx_npcs_destination on public.npcs(destination_id);
create index if not exists idx_npcs_location on public.npcs(location_id);
create index if not exists idx_story_nodes_destination on public.story_nodes(destination_id);
create index if not exists idx_story_choices_from on public.story_choices(from_node_id);
create index if not exists idx_story_choices_to on public.story_choices(to_node_id);
create index if not exists idx_quests_destination on public.quests(destination_id);
create index if not exists idx_quests_story_node on public.quests(story_node_id);
create index if not exists idx_quest_steps_quest on public.quest_steps(quest_id);
create index if not exists idx_dialogue_lines_node on public.dialogue_lines(story_node_id);
create index if not exists idx_calendar_events_user_date on public.calendar_events(user_id, life_date);
create index if not exists idx_cultural_events_destination on public.cultural_calendar_events(destination_id);
create index if not exists idx_user_preferences_user on public.user_preferences(user_id);
create index if not exists idx_user_story_progress_user on public.user_story_progress(user_id);
create index if not exists idx_user_quest_progress_user on public.user_quest_progress(user_id);

-- =========================================================
-- RLS
-- =========================================================

alter table public.destinations enable row level security;
alter table public.locations enable row level security;
alter table public.npcs enable row level security;
alter table public.story_nodes enable row level security;
alter table public.story_choices enable row level security;
alter table public.quests enable row level security;
alter table public.quest_steps enable row level security;
alter table public.dialogue_lines enable row level security;
alter table public.cultural_calendar_events enable row level security;
alter table public.user_time_state enable row level security;
alter table public.calendar_events enable row level security;
alter table public.user_preferences enable row level security;
alter table public.user_story_progress enable row level security;
alter table public.user_story_choices_made enable row level security;
alter table public.user_quest_progress enable row level security;

-- ---- admin write access (content tables) ----

drop policy if exists "admin destinations" on public.destinations;
create policy "admin destinations" on public.destinations
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin locations" on public.locations;
create policy "admin locations" on public.locations
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin npcs" on public.npcs;
create policy "admin npcs" on public.npcs
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin story nodes" on public.story_nodes;
create policy "admin story nodes" on public.story_nodes
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin story choices" on public.story_choices;
create policy "admin story choices" on public.story_choices
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin quests" on public.quests;
create policy "admin quests" on public.quests
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin quest steps" on public.quest_steps;
create policy "admin quest steps" on public.quest_steps
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin dialogue lines" on public.dialogue_lines;
create policy "admin dialogue lines" on public.dialogue_lines
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin cultural calendar events" on public.cultural_calendar_events;
create policy "admin cultural calendar events" on public.cultural_calendar_events
for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---- public read access (content tables) ----

drop policy if exists "public destinations" on public.destinations;
create policy "public destinations" on public.destinations
for select to anon, authenticated using (is_active = true);

drop policy if exists "public locations" on public.locations;
create policy "public locations" on public.locations
for select to anon, authenticated using (is_active = true);

drop policy if exists "public npcs" on public.npcs;
create policy "public npcs" on public.npcs
for select to anon, authenticated using (is_active = true);

drop policy if exists "public story nodes" on public.story_nodes;
create policy "public story nodes" on public.story_nodes
for select to anon, authenticated using (is_published = true);

drop policy if exists "public story choices" on public.story_choices;
create policy "public story choices" on public.story_choices
for select to anon, authenticated using (
  exists (
    select 1 from public.story_nodes n
    where n.id = from_node_id and n.is_published = true
  )
);

drop policy if exists "public quests" on public.quests;
create policy "public quests" on public.quests
for select to anon, authenticated using (is_published = true);

drop policy if exists "public quest steps" on public.quest_steps;
create policy "public quest steps" on public.quest_steps
for select to anon, authenticated using (
  exists (
    select 1 from public.quests q
    where q.id = quest_id and q.is_published = true
  )
);

drop policy if exists "public dialogue lines" on public.dialogue_lines;
create policy "public dialogue lines" on public.dialogue_lines
for select to anon, authenticated using (
  exists (
    select 1 from public.story_nodes n
    where n.id = story_node_id and n.is_published = true
  )
);

drop policy if exists "public cultural calendar events" on public.cultural_calendar_events;
create policy "public cultural calendar events" on public.cultural_calendar_events
for select to anon, authenticated using (is_active = true);

-- ---- per-user data (own rows only) ----

drop policy if exists "users own time state" on public.user_time_state;
create policy "users own time state" on public.user_time_state
for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "users own calendar events" on public.calendar_events;
create policy "users own calendar events" on public.calendar_events
for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "users own preferences" on public.user_preferences;
create policy "users own preferences" on public.user_preferences
for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "users own story progress" on public.user_story_progress;
create policy "users own story progress" on public.user_story_progress
for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "users own story choices made" on public.user_story_choices_made;
create policy "users own story choices made" on public.user_story_choices_made
for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "users own quest progress" on public.user_quest_progress;
create policy "users own quest progress" on public.user_quest_progress
for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- admin override on all per-user tables (support/debugging)

drop policy if exists "admin all time state" on public.user_time_state;
create policy "admin all time state" on public.user_time_state
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin all calendar events" on public.calendar_events;
create policy "admin all calendar events" on public.calendar_events
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin all preferences" on public.user_preferences;
create policy "admin all preferences" on public.user_preferences
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin all story progress" on public.user_story_progress;
create policy "admin all story progress" on public.user_story_progress
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin all quest progress" on public.user_quest_progress;
create policy "admin all quest progress" on public.user_quest_progress
for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- =========================================================
-- GAMEPLAY SUPPORT — let players submit creative sentence
-- attempts for admin review (existing valid_sentences table).
-- Players can only INSERT with is_approved = false; they can
-- never approve their own submissions or read others' drafts
-- (the existing "public approved sentences" policy from
-- schema.sql already lets everyone read is_approved = true rows).
-- =========================================================

drop policy if exists "players suggest sentences" on public.valid_sentences;
create policy "players suggest sentences" on public.valid_sentences
for insert to authenticated
with check (is_approved = false);

-- =========================================================
-- DONE — run 03 seed (optional) after this file.
-- =========================================================
