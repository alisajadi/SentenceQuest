create extension if not exists pgcrypto;

create table if not exists public.languages (
 id uuid primary key default gen_random_uuid(), code text unique not null,
 name text not null, native_name text, is_active boolean default true,
 version integer default 1, created_at timestamptz default now(), updated_at timestamptz default now()
);

create table if not exists public.vocabulary (
 id uuid primary key default gen_random_uuid(), language_id uuid not null references public.languages(id) on delete cascade,
 word text not null, normalized_word text not null, part_of_speech text not null,
 translation text, pronunciation text, level text, definition text,
 image_url text, audio_url text, metadata jsonb default '{}'::jsonb,
 is_active boolean default true, version integer default 1,
 created_at timestamptz default now(), updated_at timestamptz default now(),
 unique(language_id,normalized_word,part_of_speech)
);

create table if not exists public.word_forms (
 id uuid primary key default gen_random_uuid(), vocabulary_id uuid not null references public.vocabulary(id) on delete cascade,
 form_type text not null, form text not null, unique(vocabulary_id,form_type)
);

create table if not exists public.word_relations (
 id uuid primary key default gen_random_uuid(),
 from_word_id uuid not null references public.vocabulary(id) on delete cascade,
 to_word_id uuid not null references public.vocabulary(id) on delete cascade,
 relation_type text not null, weight numeric(5,2) default 1,
 unique(from_word_id,to_word_id,relation_type)
);

create table if not exists public.grammar (
 id uuid primary key default gen_random_uuid(), language_id uuid not null references public.languages(id) on delete cascade,
 code text not null, name text not null, level text, description text,
 rules jsonb default '{}'::jsonb, is_active boolean default true, version integer default 1,
 created_at timestamptz default now(), updated_at timestamptz default now(),
 unique(language_id,code)
);

create table if not exists public.sentence_patterns (
 id uuid primary key default gen_random_uuid(), grammar_id uuid not null references public.grammar(id) on delete cascade,
 code text not null, name text not null, slots jsonb not null, rules jsonb default '{}'::jsonb,
 unique(grammar_id,code)
);

create table if not exists public.lessons (
 id uuid primary key default gen_random_uuid(), language_id uuid not null references public.languages(id) on delete cascade,
 grammar_id uuid references public.grammar(id) on delete set null,
 pattern_id uuid references public.sentence_patterns(id) on delete set null,
 slug text unique not null, title text not null, level text, order_index integer default 0,
 target_sentence jsonb not null, image_url text, audio_url text,
 base_xp integer default 50, creativity_xp integer default 20, hint text,
 settings jsonb default '{}'::jsonb, is_published boolean default false, version integer default 1,
 created_at timestamptz default now(), updated_at timestamptz default now()
);

create table if not exists public.lesson_words (
 lesson_id uuid references public.lessons(id) on delete cascade,
 vocabulary_id uuid references public.vocabulary(id) on delete cascade,
 role text, sort_order integer default 0, primary key(lesson_id,vocabulary_id)
);

create table if not exists public.valid_sentences (
 id uuid primary key default gen_random_uuid(), lesson_id uuid references public.lessons(id) on delete cascade,
 tokens jsonb not null, sentence_text text not null, source text default 'admin',
 confidence numeric(5,4), is_approved boolean default false, created_at timestamptz default now(),
 unique(lesson_id,sentence_text)
);

create table if not exists public.collections (
 id uuid primary key default gen_random_uuid(), language_id uuid references public.languages(id) on delete cascade,
 slug text unique not null, name text not null, description text, version integer default 1,
 is_published boolean default false, created_at timestamptz default now(), updated_at timestamptz default now()
);

create table if not exists public.collection_items (
 collection_id uuid references public.collections(id) on delete cascade,
 vocabulary_id uuid references public.vocabulary(id) on delete cascade,
 lesson_id uuid references public.lessons(id) on delete cascade,
 sort_order integer default 0,
 primary key(collection_id,vocabulary_id,lesson_id),
 check(vocabulary_id is not null or lesson_id is not null)
);

create table if not exists public.gifts (
 id uuid primary key default gen_random_uuid(), language_id uuid references public.languages(id) on delete cascade,
 required_xp integer not null, title text not null, vocabulary_id uuid references public.vocabulary(id) on delete set null,
 image_url text, description text, is_active boolean default true
);

create table if not exists public.app_config (
 key text primary key, value jsonb not null, version integer default 1, updated_at timestamptz default now()
);

create table if not exists public.database_versions (
 id bigint generated always as identity primary key, version integer unique not null,
 release_name text, checksum text, notes text, created_at timestamptz default now(), is_current boolean default false
);

create table if not exists public.sync_changes (
 id bigint generated always as identity primary key, db_version integer not null,
 entity_type text not null, entity_id uuid, operation text not null check(operation in('upsert','delete')),
 payload jsonb, created_at timestamptz default now()
);

create table if not exists public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text, xp integer default 0, current_level integer default 1,
 created_at timestamptz default now(), updated_at timestamptz default now()
);

create table if not exists public.user_progress (
 user_id uuid references auth.users(id) on delete cascade,
 lesson_id uuid references public.lessons(id) on delete cascade,
 completed boolean default false, best_score integer default 0, attempts integer default 0,
 updated_at timestamptz default now(), primary key(user_id,lesson_id)
);

create table if not exists public.user_vocabulary (
 user_id uuid references auth.users(id) on delete cascade,
 vocabulary_id uuid references public.vocabulary(id) on delete cascade,
 unlocked_at timestamptz default now(), mastery numeric(5,2) default 0,
 primary key(user_id,vocabulary_id)
);

create table if not exists public.user_gifts (
 user_id uuid references auth.users(id) on delete cascade,
 gift_id uuid references public.gifts(id) on delete cascade,
 unlocked_at timestamptz default now(), claimed_at timestamptz,
 primary key(user_id,gift_id)
);

create index if not exists idx_vocab_language on public.vocabulary(language_id);
create index if not exists idx_lessons_order on public.lessons(language_id,order_index);
create index if not exists idx_sync_version on public.sync_changes(db_version);

alter table public.languages enable row level security;
alter table public.vocabulary enable row level security;
alter table public.grammar enable row level security;
alter table public.sentence_patterns enable row level security;
alter table public.lessons enable row level security;
alter table public.lesson_words enable row level security;
alter table public.valid_sentences enable row level security;
alter table public.collections enable row level security;
alter table public.collection_items enable row level security;
alter table public.gifts enable row level security;
alter table public.app_config enable row level security;
alter table public.database_versions enable row level security;
alter table public.profiles enable row level security;
alter table public.user_progress enable row level security;
alter table public.user_vocabulary enable row level security;
alter table public.user_gifts enable row level security;

create policy "published languages" on public.languages for select using(is_active);
create policy "active vocabulary" on public.vocabulary for select using(is_active);
create policy "active grammar" on public.grammar for select using(is_active);
create policy "published lessons" on public.lessons for select using(is_published);
create policy "published lesson words" on public.lesson_words for select using(exists(select 1 from lessons l where l.id=lesson_id and l.is_published));
create policy "approved sentences" on public.valid_sentences for select using(is_approved);
create policy "published collections" on public.collections for select using(is_published);
create policy "published collection items" on public.collection_items for select using(exists(select 1 from collections c where c.id=collection_id and c.is_published));
create policy "active gifts" on public.gifts for select using(is_active);
create policy "config read" on public.app_config for select using(true);
create policy "current version read" on public.database_versions for select using(is_current);

create policy "own profile" on public.profiles for all using(auth.uid()=id) with check(auth.uid()=id);
create policy "own progress" on public.user_progress for all using(auth.uid()=user_id) with check(auth.uid()=user_id);
create policy "own vocabulary" on public.user_vocabulary for all using(auth.uid()=user_id) with check(auth.uid()=user_id);
create policy "own gifts" on public.user_gifts for all using(auth.uid()=user_id) with check(auth.uid()=user_id);

-- IMPORTANT: no public admin-write policies. Admin mutations belong in protected Edge Functions.
