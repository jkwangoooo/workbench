-- Stage 0 marker only. This migration is intentionally non-destructive and
-- does not create, alter, or delete business tables or student data.
begin;
do $$
begin
  raise notice 'teacher-workbench stage 0 baseline: no schema changes applied';
end
$$;
commit;
