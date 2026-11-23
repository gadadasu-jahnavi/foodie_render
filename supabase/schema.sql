-- Run this file in Supabase Dashboard > SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null unique,
  role text not null check (role in ('admin','buyer','seller','rider')),
  phone text default '',
  city text default '',
  created_at timestamptz not null default now()
);

create table if not exists public.restaurants (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  city text default '',
  description text default '',
  status text not null default 'pending' check(status in ('pending','approved','rejected','suspended')),
  created_at timestamptz not null default now()
);

create table if not exists public.menu_items (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  description text default '',
  price numeric(10,2) not null check(price >= 0),
  category text default 'Main',
  image_url text default '',
  available boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.profiles(id),
  seller_id uuid not null references public.profiles(id),
  rider_id uuid references public.profiles(id),
  address text not null,
  total numeric(10,2) not null default 0,
  status text not null default 'placed',
  created_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  menu_item_id uuid references public.menu_items(id) on delete set null,
  name text not null,
  quantity integer not null check(quantity > 0),
  unit_price numeric(10,2) not null
);

create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  description text not null,
  discount_percent integer not null check(discount_percent between 1 and 90),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_restaurants_owner on public.restaurants(owner_id);
create index if not exists idx_menu_seller on public.menu_items(seller_id);
create index if not exists idx_orders_buyer on public.orders(buyer_id);
create index if not exists idx_orders_seller on public.orders(seller_id);

-- RLS is enabled as defense-in-depth. The FastAPI server uses the service-role
-- key only on the server and applies its own verified-user/role checks.
alter table public.profiles enable row level security;
alter table public.restaurants enable row level security;
alter table public.menu_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.offers enable row level security;

-- Public/anon access is intentionally not granted. API requests go through FastAPI.
-- Do not expose SUPABASE_SERVICE_ROLE_KEY in frontend code.
