-- Custos fixos recorrentes e histórico mensal de pagamentos.
create table if not exists public.fixed_costs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  amount numeric(12,2) not null check (amount > 0),
  due_day smallint not null default 10 check (due_day between 1 and 31),
  category text not null default 'Despesas fixas',
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fixed_cost_payments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  fixed_cost_id uuid not null references public.fixed_costs(id) on delete cascade,
  reference_month date not null,
  amount numeric(12,2) not null check (amount > 0),
  paid_on date not null default current_date,
  cash_entry_id bigint references public.cash_entries(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (fixed_cost_id, reference_month)
);

create index if not exists fixed_costs_owner_active_idx
  on public.fixed_costs(owner_id, active, due_day);
create index if not exists fixed_cost_payments_owner_month_idx
  on public.fixed_cost_payments(owner_id, reference_month);

alter table public.fixed_costs enable row level security;
alter table public.fixed_cost_payments enable row level security;

revoke all on public.fixed_costs, public.fixed_cost_payments from anon;
grant select, insert, update, delete on public.fixed_costs, public.fixed_cost_payments to authenticated;

drop policy if exists fixed_costs_owner_developer_all on public.fixed_costs;
create policy fixed_costs_owner_developer_all
  on public.fixed_costs
  for all to authenticated
  using (private.has_store_role(owner_id, array['owner','developer']))
  with check (private.has_store_role(owner_id, array['owner','developer']));

drop policy if exists fixed_cost_payments_owner_developer_all on public.fixed_cost_payments;
create policy fixed_cost_payments_owner_developer_all
  on public.fixed_cost_payments
  for all to authenticated
  using (private.has_store_role(owner_id, array['owner','developer']))
  with check (private.has_store_role(owner_id, array['owner','developer']));

create or replace function public.set_updated_at_fixed_costs()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists fixed_costs_updated_at on public.fixed_costs;
create trigger fixed_costs_updated_at
before update on public.fixed_costs
for each row execute function public.set_updated_at_fixed_costs();
