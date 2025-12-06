-- Esquema base para Supabase (PostgreSQL)
-- Ejecutar en el editor SQL de Supabase

-- Tabla de perfiles vinculada a auth.users
create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    email text not null unique,
    full_name text,
    role text not null default 'user' check (role in ('user','admin')),
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    deleted_at timestamptz
);

create or replace function public.update_timestamp()
returns trigger as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$ language plpgsql;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute procedure public.update_timestamp();

-- Tabla de categorías
create table if not exists public.categories (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles(id) on delete cascade,
    type text not null check (type in ('income','expense')),
    name text not null,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    deleted_at timestamptz
);

create trigger categories_set_updated_at
before update on public.categories
for each row execute procedure public.update_timestamp();

create index if not exists idx_categories_user_id on public.categories(user_id) where deleted_at is null;
create unique index if not exists idx_categories_unique_user_type_name on public.categories(user_id, type, lower(name)) where deleted_at is null;

-- Tabla de cuentas bancarias de usuario
create table if not exists public.accounts (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles(id) on delete cascade,
    name text not null,
    bank_institution text not null,
    institution_name text,
    currency text not null check (currency in ('NIO','USD')),
    initial_balance numeric(12,2),
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    deleted_at timestamptz,
    constraint accounts_institution_name_check
      check (
        bank_institution <> 'Otro'
        or (institution_name is not null and length(trim(institution_name)) > 0)
      )
);

create trigger accounts_set_updated_at
before update on public.accounts
for each row execute procedure public.update_timestamp();

create index if not exists idx_accounts_user_id on public.accounts(user_id) where deleted_at is null;

-- Tabla de ingresos
create table if not exists public.incomes (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles(id) on delete cascade,
    category_id uuid references public.categories(id),
    amount numeric(12,2) not null check (amount >= 0),
    currency text not null default 'USD',
    source text not null default 'cash' check (source in ('cash','bank')),
    account_id uuid references public.accounts(id) on delete set null,
    date date not null,
    note text,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    deleted_at timestamptz
);

create trigger incomes_set_updated_at
before update on public.incomes
for each row execute procedure public.update_timestamp();

create index if not exists idx_incomes_user_id on public.incomes(user_id) where deleted_at is null;
create index if not exists idx_incomes_date on public.incomes(date);
create index if not exists idx_incomes_account_id on public.incomes(account_id) where deleted_at is null;

-- Tabla de gastos
create table if not exists public.expenses (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles(id) on delete cascade,
    category_id uuid references public.categories(id),
    amount numeric(12,2) not null check (amount >= 0),
    currency text not null default 'USD',
    source text not null default 'cash' check (source in ('cash','bank')),
    account_id uuid references public.accounts(id) on delete set null,
    date date not null,
    note text,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    deleted_at timestamptz
);

create trigger expenses_set_updated_at
before update on public.expenses
for each row execute procedure public.update_timestamp();

create index if not exists idx_expenses_user_id on public.expenses(user_id) where deleted_at is null;
create index if not exists idx_expenses_date on public.expenses(date);
create index if not exists idx_expenses_account_id on public.expenses(account_id) where deleted_at is null;

-- Habilitar RLS en todas las tablas
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.accounts enable row level security;
alter table public.incomes enable row level security;
alter table public.expenses enable row level security;

-- Políticas para profiles
create policy "Usuarios ven su perfil" on public.profiles
for select using (auth.uid() = id);

create policy "Usuarios pueden insertarse" on public.profiles
for insert with check (auth.uid() = id);

create policy "Usuarios actualizan su perfil" on public.profiles
for update using (auth.uid() = id);

create policy "Admins gestionan perfiles" on public.profiles
for all using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);

-- Políticas para categories
create policy "Usuarios manejan sus categorías" on public.categories
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Admins gestionan todas las categorías" on public.categories
for all using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);

-- Políticas para accounts
create policy "Usuarios administran sus cuentas" on public.accounts
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Admins gestionan todas las cuentas" on public.accounts
for all using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);

-- Políticas para incomes
create policy "Usuarios manejan sus ingresos" on public.incomes
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Admins gestionan todos los ingresos" on public.incomes
for all using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);

-- Políticas para expenses
create policy "Usuarios manejan sus gastos" on public.expenses
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Admins gestionan todos los gastos" on public.expenses
for all using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);

-- Tabla de transferencias
create table if not exists public.transfers (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles(id) on delete cascade,
    amount numeric(12,2) not null check (amount >= 0),
    currency text not null check (currency in ('NIO','USD')),
    from_type text not null check (from_type in ('cash','bank')),
    from_account_id uuid references public.accounts(id) on delete set null,
    to_type text not null check (to_type in ('cash','bank')),
    to_account_id uuid references public.accounts(id) on delete set null,
    date date not null,
    note text,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    deleted_at timestamptz
);

alter table public.transfers
  add constraint transfers_from_account_check
    check (
      (from_type = 'bank' and from_account_id is not null)
      or (from_type = 'cash' and from_account_id is null)
    );

alter table public.transfers
  add constraint transfers_to_account_check
    check (
      (to_type = 'bank' and to_account_id is not null)
      or (to_type = 'cash' and to_account_id is null)
    );

alter table public.transfers
  add constraint transfers_distinct_accounts
    check (
      not (
        from_type = 'bank'
        and to_type = 'bank'
        and from_account_id = to_account_id
      )
    );

create trigger transfers_set_updated_at
before update on public.transfers
for each row execute procedure public.update_timestamp();

create index if not exists idx_transfers_user_id on public.transfers(user_id) where deleted_at is null;
create index if not exists idx_transfers_date on public.transfers(date);
create index if not exists idx_transfers_from_account on public.transfers(from_account_id) where from_account_id is not null and deleted_at is null;
create index if not exists idx_transfers_to_account on public.transfers(to_account_id) where to_account_id is not null and deleted_at is null;

alter table public.transfers enable row level security;

create policy "Usuarios manejan sus transferencias" on public.transfers
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Admins gestionan todas las transferencias" on public.transfers
for all using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);
