alter table public.shoot_days
  add column weather text not null default '',
  add column rain_plan text not null default '',
  add column safety_notes text not null default '',
  add column emergency_contact_name text not null default '',
  add column emergency_contact_role text not null default '',
  add column emergency_contact_phone text not null default '';
