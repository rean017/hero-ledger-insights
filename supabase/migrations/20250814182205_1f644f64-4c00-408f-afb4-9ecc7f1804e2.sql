-- Distinct months present in facts_monthly_location
create or replace view public.v_available_months as
select distinct fml.month
from public.facts_monthly_location fml
where fml.month ~ '^\d{4}-\d{2}$'
order by fml.month desc;

-- RPC for the frontend
create or replace function public.mh_get_available_months()
returns table (month text)
language sql
stable
as $$
  select month from public.v_available_months;
$$;

-- RLS safety: ensure a permissive read policy exists for facts_monthly_location
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public'
      and tablename='facts_monthly_location'
      and policyname='read_fml_internal'
  ) then
    create policy read_fml_internal on public.facts_monthly_location
      for select using (true);
  end if;
end $$;

-- Diagnostic RPC to confirm what's in the table
create or replace function public.mh_diag_month_counts()
returns table (month text, rows bigint)
language sql
stable
as $$
  select month, count(*) as rows
  from facts_monthly_location
  group by 1
  order by 1 desc;
$$;