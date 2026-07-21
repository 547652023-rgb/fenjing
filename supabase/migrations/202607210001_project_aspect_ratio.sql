alter table public.projects
  add column if not exists aspect_ratio text not null default '16:9';
