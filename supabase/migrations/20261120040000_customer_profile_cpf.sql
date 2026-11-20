create function private.valid_customer_cpf(value text)
returns boolean language plpgsql immutable strict set search_path = '' as $$
declare
  digit integer;
  total integer;
  position integer;
  length integer;
begin
  if value !~ '^[0-9]{11}$' or value = repeat(left(value, 1), 11) then return false; end if;
  for length in 9..10 loop
    total := 0;
    for position in 1..length loop
      total := total + substr(value, position, 1)::integer * (length + 2 - position);
    end loop;
    digit := (total * 10) % 11;
    if digit = 10 then digit := 0; end if;
    if digit <> substr(value, length + 1, 1)::integer then return false; end if;
  end loop;
  return true;
end;
$$;

create table public.customer_tax_ids (
  customer_id uuid primary key references auth.users(id) on delete cascade,
  cpf text not null check (private.valid_customer_cpf(cpf))
);
alter table public.customer_tax_ids enable row level security;
revoke all on public.customer_tax_ids from public, anon, authenticated;
grant select, insert on public.customer_tax_ids to authenticated;
grant select on public.customer_tax_ids to service_role;
create policy "Customers read their own CPF" on public.customer_tax_ids
for select to authenticated using (customer_id = (select auth.uid()));
create policy "Customers register their own CPF" on public.customer_tax_ids
for insert to authenticated with check (customer_id = (select auth.uid()));
