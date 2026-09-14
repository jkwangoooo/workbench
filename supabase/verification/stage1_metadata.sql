-- Read-only preflight. Run in Supabase SQL Editor before applying stage1 migration.
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name in ('classes', 'students', 'student_roster_details', 'student_profiles')
order by table_name, ordinal_position;
select tc.table_name, tc.constraint_name, tc.constraint_type
from information_schema.table_constraints tc
where tc.table_schema = 'public' and tc.table_name in ('classes', 'students', 'student_roster_details', 'student_profiles');
select schemaname, tablename, indexname, indexdef
from pg_indexes where schemaname = 'public' and tablename in ('classes', 'students', 'student_roster_details', 'student_profiles');
select schemaname, tablename, policyname, cmd, qual, with_check
from pg_policies where schemaname = 'public' and tablename in ('classes', 'students', 'student_roster_details', 'student_profiles');
