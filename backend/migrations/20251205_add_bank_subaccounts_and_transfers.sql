-- Introduces user-managed financial accounts and refactors related tables to reference them.

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  bank_institution text not null,
  institution_name text,
  currency text not null check (currency in ('NIO', 'USD')),
  initial_balance numeric(12,2),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  constraint accounts_institution_name_check
    check (
      bank_institution <> 'Otro' or (institution_name is not null and length(trim(institution_name)) > 0)
    )
);

create index if not exists idx_accounts_user_id on public.accounts(user_id) where deleted_at is null;

create trigger accounts_set_updated_at
  before update on public.accounts
  for each row execute procedure public.update_timestamp();

alter table public.accounts enable row level security;

drop policy if exists "Usuarios administran sus cuentas" on public.accounts;
create policy "Usuarios administran sus cuentas" on public.accounts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Admins gestionan todas las cuentas" on public.accounts;
create policy "Admins gestionan todas las cuentas" on public.accounts
  for all using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

alter table public.incomes
  drop constraint if exists incomes_bank_name_valid,
  drop column if exists bank_name,
  add column if not exists account_id uuid references public.accounts(id) on delete set null;

create index if not exists idx_incomes_account_id on public.incomes(account_id) where deleted_at is null;

alter table public.expenses
  drop constraint if exists expenses_bank_name_valid,
  drop column if exists bank_name,
  add column if not exists account_id uuid references public.accounts(id) on delete set null;

create index if not exists idx_expenses_account_id on public.expenses(account_id) where deleted_at is null;

drop table if exists public.transfers;

create table public.transfers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount numeric(12,2) not null check (amount >= 0),
  currency text not null check (currency in ('NIO', 'USD')),
  from_type text not null check (from_type in ('cash', 'bank')),
  from_account_id uuid references public.accounts(id) on delete set null,
  to_type text not null check (to_type in ('cash', 'bank')),
  to_account_id uuid references public.accounts(id) on delete set null,
  date date not null,
  note text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  constraint transfers_from_account_check
    check (
      (from_type = 'bank' and from_account_id is not null)
      or (from_type = 'cash' and from_account_id is null)
    ),
  constraint transfers_to_account_check
    check (
      (to_type = 'bank' and to_account_id is not null)
      or (to_type = 'cash' and to_account_id is null)
    ),
  constraint transfers_distinct_accounts
    check (
      not (
        from_type = 'bank'
        and to_type = 'bank'
        and from_account_id = to_account_id
      )
    )
);

create index if not exists idx_transfers_user_id on public.transfers(user_id) where deleted_at is null;
create index if not exists idx_transfers_date on public.transfers(date);
create index if not exists idx_transfers_from_account on public.transfers(from_account_id) where from_account_id is not null and deleted_at is null;
create index if not exists idx_transfers_to_account on public.transfers(to_account_id) where to_account_id is not null and deleted_at is null;

create trigger transfers_set_updated_at
  before update on public.transfers
  for each row execute procedure public.update_timestamp();

alter table public.transfers enable row level security;

drop policy if exists "Usuarios manejan sus transferencias" on public.transfers;
create policy "Usuarios manejan sus transferencias" on public.transfers
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Admins gestionan todas las transferencias" on public.transfers;
create policy "Admins gestionan todas las transferencias" on public.transfers
  for all using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );
