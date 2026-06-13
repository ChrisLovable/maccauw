-- Maccauw Clay Target Club scorer — Supabase schema
-- Run this once in the Supabase SQL editor for your project.

create table if not exists competitions (
  id bigint generated always as identity primary key,
  name text not null,
  date date not null,
  discipline text not null,
  max_score integer not null default 25,
  created_at timestamptz not null default now()
);

create table if not exists results (
  id bigint generated always as identity primary key,
  competition_id bigint not null references competitions(id) on delete cascade,
  shooter_name text not null,
  shooter_class text default '',
  total integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index if not exists results_competition_id_idx on results(competition_id);
