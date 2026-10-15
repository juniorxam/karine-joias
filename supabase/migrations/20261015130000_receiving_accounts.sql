-- Contas de recebimento exibidas e gerenciadas em Configurações.
create table if not exists public.receiving_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  account_type text not null default 'PIX' check (account_type in ('PIX','BANK','MERCADO_PAGO')),
  label text not null,
  holder_name text,
  holder_document text,
  pix_key_type text check (pix_key_type is null or pix_key_type in ('RANDOM','CPF','CNPJ','EMAIL','PHONE')),
  pix_key text,
  bank_name text,
  bank_code text,
  agency text,
  account_number text,
  account_type_bank text check (account_type_bank is null or account_type_bank in ('CORRENTE','POUPANCA')),
  enabled boolean not null default true,
  is_default boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint receiving_accounts_pix_fields_check check (
    account_type <> 'PIX' or (pix_key_type is not null and pix_key is not null and length(trim(pix_key)) > 0)
  ),
  constraint receiving_accounts_bank_fields_check check (
    account_type <> 'BANK' or (bank_name is not null and agency is not null and account_number is not null)
  )
);

create index if not exists receiving_accounts_owner_idx
  on public.receiving_accounts(owner_id, is_default desc, created_at asc);

alter table public.receiving_accounts enable row level security;

revoke all on public.receiving_accounts from anon;
grant select, insert, update, delete on public.receiving_accounts to authenticated;

drop policy if exists receiving_accounts_owner_developer_all on public.receiving_accounts;
create policy receiving_accounts_owner_developer_all
  on public.receiving_accounts
  for all to authenticated
  using (private.has_store_role(owner_id, array['owner','developer']))
  with check (private.has_store_role(owner_id, array['owner','developer']));

create or replace function public.set_updated_at_receiving_accounts()
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

drop trigger if exists receiving_accounts_updated_at on public.receiving_accounts;
create trigger receiving_accounts_updated_at
before update on public.receiving_accounts
for each row execute function public.set_updated_at_receiving_accounts();
