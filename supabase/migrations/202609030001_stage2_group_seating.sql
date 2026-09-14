-- Stage 2 additive migration. Generate only; apply after stage2_metadata.sql is reviewed.
begin;
create table if not exists public.class_group_layouts (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid(), class_id uuid not null references public.classes(id) on delete restrict,
  template_version integer not null, updated_at timestamptz not null default now(), unique(owner_id, class_id), unique(id, owner_id)
);
create table if not exists public.class_group_members (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid(), layout_id uuid not null, student_id uuid not null references public.students(id) on delete restrict,
  group_index integer not null check (group_index > 0), slot_index integer not null check (slot_index >= 0), is_leader boolean not null default false,
  unique(owner_id, layout_id, student_id), unique(owner_id, layout_id, group_index, slot_index), foreign key(layout_id, owner_id) references public.class_group_layouts(id, owner_id) on delete cascade
);
create unique index if not exists class_group_one_leader_idx on public.class_group_members(owner_id, layout_id, group_index) where is_leader;
create table if not exists public.class_seating_layouts (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid(), class_id uuid not null references public.classes(id) on delete restrict,
  template_version integer not null, row_count integer not null check(row_count > 0), column_count integer not null check(column_count > 0), updated_at timestamptz not null default now(), unique(owner_id, class_id), unique(id, owner_id)
);
create table if not exists public.class_seating_cells (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid(), layout_id uuid not null, row_index integer not null check(row_index >= 0), column_index integer not null check(column_index >= 0),
  cell_kind text not null check(cell_kind in ('student','empty','aisle','podium')), student_id uuid references public.students(id) on delete restrict, row_span integer not null default 1 check(row_span > 0), column_span integer not null default 1 check(column_span > 0),
  unique(owner_id, layout_id, row_index, column_index), unique(owner_id, layout_id, student_id), foreign key(layout_id, owner_id) references public.class_seating_layouts(id, owner_id) on delete cascade,
  check((cell_kind = 'student' and student_id is not null) or (cell_kind <> 'student' and student_id is null))
);
create or replace function public.enforce_group_seating_scope() returns trigger language plpgsql security invoker as $$
declare layout_owner uuid; layout_class uuid; student_owner uuid; student_class uuid; begin
  if tg_table_name = 'class_group_layouts' or tg_table_name = 'class_seating_layouts' then
    if new.owner_id <> auth.uid() or not exists(select 1 from public.classes as c where c.id = new.class_id and c.owner_id = auth.uid() and c.name = '2025级8班') then raise exception 'layout owner/class scope mismatch'; end if;
    return new;
  end if;
  if tg_table_name = 'class_group_members' then select owner_id,class_id into layout_owner,layout_class from public.class_group_layouts where id=new.layout_id;
  else select owner_id,class_id into layout_owner,layout_class from public.class_seating_layouts where id=new.layout_id; end if;
  select owner_id,class_id into student_owner,student_class from public.students where id=new.student_id;
  if student_owner is null or layout_owner is null or student_owner <> new.owner_id or layout_owner <> new.owner_id or student_class <> layout_class then raise exception 'layout student owner/class mismatch'; end if;
  return new; end $$;
drop trigger if exists class_group_members_scope on public.class_group_members;
create trigger class_group_members_scope before insert or update on public.class_group_members for each row execute function public.enforce_group_seating_scope();
drop trigger if exists class_seating_cells_scope on public.class_seating_cells;
create trigger class_seating_cells_scope before insert or update on public.class_seating_cells for each row when (new.student_id is not null) execute function public.enforce_group_seating_scope();
drop trigger if exists class_group_layouts_scope on public.class_group_layouts;
create trigger class_group_layouts_scope before insert or update on public.class_group_layouts for each row execute function public.enforce_group_seating_scope();
drop trigger if exists class_seating_layouts_scope on public.class_seating_layouts;
create trigger class_seating_layouts_scope before insert or update on public.class_seating_layouts for each row execute function public.enforce_group_seating_scope();
alter table public.class_group_layouts enable row level security; alter table public.class_group_members enable row level security; alter table public.class_seating_layouts enable row level security; alter table public.class_seating_cells enable row level security;
drop policy if exists class_group_layouts_owner on public.class_group_layouts;
create policy class_group_layouts_owner on public.class_group_layouts for all to authenticated using(auth.uid()=owner_id) with check(auth.uid()=owner_id);
drop policy if exists class_group_members_owner on public.class_group_members;
create policy class_group_members_owner on public.class_group_members for all to authenticated using(auth.uid()=owner_id) with check(auth.uid()=owner_id);
drop policy if exists class_seating_layouts_owner on public.class_seating_layouts;
create policy class_seating_layouts_owner on public.class_seating_layouts for all to authenticated using(auth.uid()=owner_id) with check(auth.uid()=owner_id);
drop policy if exists class_seating_cells_owner on public.class_seating_cells;
create policy class_seating_cells_owner on public.class_seating_cells for all to authenticated using(auth.uid()=owner_id) with check(auth.uid()=owner_id);
create or replace function public.replace_group_layout(p_class_id uuid,p_template_version integer,p_groups jsonb) returns void language plpgsql security invoker as $$ declare v_layout_id uuid; v_group jsonb; v_member jsonb; begin
  if not exists(select 1 from public.classes as c where c.id = p_class_id and c.owner_id = auth.uid() and c.name = '2025级8班') then raise exception '8班 class scope required'; end if;
  if p_template_version <> 1 or p_groups is null or jsonb_typeof(p_groups) <> 'array' then raise exception 'unknown group template version or structure'; end if;
  for v_group in select value from jsonb_array_elements(p_groups) loop
    if jsonb_typeof(v_group->'members') <> 'array' or v_group->>'groupIndex' is null or (v_group->>'groupIndex')::int < 1 then raise exception 'invalid group structure'; end if;
    for v_member in select value from jsonb_array_elements(v_group->'members') loop
      if v_member->>'studentId' is null or v_member->>'slotIndex' is null or (v_member->>'slotIndex')::int < 0 then raise exception 'invalid group member structure'; end if;
    end loop;
  end loop;
  insert into public.class_group_layouts(owner_id,class_id,template_version) values(auth.uid(),p_class_id,p_template_version) on conflict(owner_id,class_id) do update set template_version=excluded.template_version,updated_at=now() returning id into v_layout_id;
  delete from public.class_group_members where owner_id=auth.uid() and layout_id=v_layout_id;
  insert into public.class_group_members(owner_id,layout_id,student_id,group_index,slot_index,is_leader) select auth.uid(),v_layout_id,(m->>'studentId')::uuid,(g->>'groupIndex')::int,(m->>'slotIndex')::int,coalesce((m->>'isLeader')::boolean,false) from jsonb_array_elements(p_groups) g cross join lateral jsonb_array_elements(g->'members') m;
end $$;
create or replace function public.replace_seating_layout(p_class_id uuid,p_template_version integer,p_row_count integer,p_column_count integer,p_cells jsonb) returns void language plpgsql security invoker as $$ declare v_layout_id uuid; v_cell jsonb; v_row integer; v_column integer; v_kind text; begin
  if not exists(select 1 from public.classes as c where c.id = p_class_id and c.owner_id = auth.uid() and c.name = '2025级8班') then raise exception '8班 class scope required'; end if;
  if p_template_version <> 1 or p_row_count <> 8 or p_column_count <> 9 or p_cells is null or jsonb_typeof(p_cells) <> 'array' or jsonb_array_length(p_cells) <> 72 then raise exception 'unknown seating template version or structure'; end if;
  for v_cell in select value from jsonb_array_elements(p_cells) loop
    begin
      v_row := (v_cell->>'rowIndex')::integer;
      v_column := (v_cell->>'columnIndex')::integer;
    exception when invalid_text_representation then
      raise exception 'invalid seating cell coordinate';
    end;
    v_kind := v_cell->>'cellKind';
    if v_row not between 0 and 7 or v_column not between 0 and 8 or v_kind not in ('student','empty','aisle','podium') then raise exception 'invalid seating cell structure'; end if;
    if v_row = 0 and v_kind <> 'podium' then raise exception 'podium row required'; end if;
    if v_row > 0 and v_column = 4 and v_kind <> 'aisle' then raise exception 'aisle column required'; end if;
    if (v_row > 0 and v_column <> 4) and v_kind in ('podium','aisle') then raise exception 'invalid seating structure position'; end if;
  end loop;
  insert into public.class_seating_layouts(owner_id,class_id,template_version,row_count,column_count) values(auth.uid(),p_class_id,p_template_version,p_row_count,p_column_count) on conflict(owner_id,class_id) do update set template_version=excluded.template_version,row_count=excluded.row_count,column_count=excluded.column_count,updated_at=now() returning id into v_layout_id;
  delete from public.class_seating_cells where owner_id=auth.uid() and layout_id=v_layout_id;
  insert into public.class_seating_cells(owner_id,layout_id,row_index,column_index,cell_kind,student_id) select auth.uid(),v_layout_id,(c->>'rowIndex')::int,(c->>'columnIndex')::int,c->>'cellKind',nullif(c->>'studentId','')::uuid from jsonb_array_elements(p_cells) c;
end $$;
commit;
