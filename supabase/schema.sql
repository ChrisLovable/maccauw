-- Maccauw Clay Target Club scorer — Supabase schema
-- Run this once in the Supabase SQL editor for your project.

create table if not exists competitions (
  id bigint generated always as identity primary key,
  name text not null,
  date date not null,
  created_at timestamptz not null default now()
);

create table if not exists results (
  id bigint generated always as identity primary key,
  competition_id bigint not null references competitions(id) on delete cascade,
  shooter_name text not null,
  shooter_class text not null default '',
  ata_score integer,
  dtl_score integer,
  doubles_score integer,
  total integer generated always as (
    coalesce(ata_score, 0) + coalesce(dtl_score, 0) + coalesce(doubles_score, 0)
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists results_competition_id_idx on results(competition_id);
