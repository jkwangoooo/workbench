-- Stage 1 additive migration. Apply only after running verification/stage1_metadata.sql.
-- No existing columns or rows are changed; data backfill is intentionally separate.
begin;
create table if not exists public.student_roster_details (
  student_id uuid primary key references public.students(id) on delete restrict,
  owner_id uuid not null default auth.uid(),
  class_id uuid not null references public.classes(id) on delete restrict,
  identity_document_no text,
  provincial_student_no text,
  exam_no text,
  source_schema_version integer not null default 1,
  updated_at timestamptz not null default now(),
  unique (student_id, owner_id)
);
create table if not exists public.student_profiles (
  student_id uuid primary key references public.students(id) on delete restrict,
  owner_id uuid not null default auth.uid(),
  class_id uuid not null references public.classes(id) on delete restrict,
  gender text, health_status text, ethnicity text, birth_month text, student_id_number text,
  address text, phone text, father_name text, father_phone text, father_work_unit text,
  mother_name text, mother_phone text, mother_work_unit text, hobbies text, strengths text,
  source_schema_version integer not null default 1,
  updated_at timestamptz not null default now(),
  unique (student_id, owner_id)
);
create index if not exists student_roster_details_owner_class_idx on public.student_roster_details(owner_id, class_id);
create index if not exists student_profiles_owner_class_idx on public.student_profiles(owner_id, class_id);
create or replace function public.enforce_student_detail_scope() returns trigger language plpgsql security invoker as $$
declare student_owner uuid; student_class uuid; class_owner uuid;
begin
  select s.owner_id, s.class_id into student_owner, student_class from public.students s where s.id = new.student_id;
  select c.owner_id into class_owner from public.classes c where c.id = new.class_id;
  if student_owner is null or class_owner is null or student_owner <> new.owner_id or class_owner <> new.owner_id or student_class <> new.class_id then
    raise exception 'student detail owner/class mismatch';
  end if;
  return new;
end $$;
drop trigger if exists student_roster_details_scope on public.student_roster_details;
create trigger student_roster_details_scope before insert or update on public.student_roster_details for each row execute function public.enforce_student_detail_scope();
drop trigger if exists student_profiles_scope on public.student_profiles;
create trigger student_profiles_scope before insert or update on public.student_profiles for each row execute function public.enforce_student_detail_scope();
alter table public.student_roster_details enable row level security;
alter table public.student_profiles enable row level security;
drop policy if exists student_roster_details_owner_policy on public.student_roster_details;
create policy student_roster_details_owner_policy on public.student_roster_details for all to authenticated using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
drop policy if exists student_profiles_owner_policy on public.student_profiles;
create policy student_profiles_owner_policy on public.student_profiles for all to authenticated using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
commit;
