-- Read-only metadata checks. This file intentionally contains no data writes or DDL.
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name in ('classes', 'students')
order by table_name, ordinal_position;

select exists (select 1 from public.classes where name = '2025级8班') as class_8_exists;

select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name in ('class_group_layouts', 'class_group_members', 'class_seating_layouts', 'class_seating_cells')
order by table_name, ordinal_position;

select n.nspname as schema_name, c.relname as table_name, c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('class_group_layouts', 'class_group_members', 'class_seating_layouts', 'class_seating_cells')
order by c.relname;

select tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename in ('class_group_layouts', 'class_group_members', 'class_seating_layouts', 'class_seating_cells')
order by tablename, policyname;

select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename in ('class_group_layouts', 'class_group_members', 'class_seating_layouts', 'class_seating_cells')
order by tablename, indexname;

select trigger_name, event_object_table, event_manipulation, action_statement
from information_schema.triggers
where trigger_schema = 'public' and event_object_table in ('class_group_layouts', 'class_group_members', 'class_seating_layouts', 'class_seating_cells')
order by event_object_table, trigger_name;

select routine_name, routine_type, security_type, data_type
from information_schema.routines
where routine_schema = 'public' and routine_name in ('replace_group_layout', 'replace_seating_layout', 'enforce_group_seating_scope')
order by routine_name;
