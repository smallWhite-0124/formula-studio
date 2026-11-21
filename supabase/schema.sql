-- Formula Studio cloud schema
-- Run this in Supabase Dashboard -> SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null default '未命名文档',
  content jsonb not null default '{"type":"doc","content":[]}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists documents_owner_updated_idx
  on public.documents (owner_id, updated_at desc);

alter table public.documents enable row level security;

drop policy if exists "documents_select_own" on public.documents;
create policy "documents_select_own"
  on public.documents for select
  to authenticated
  using ((select auth.uid()) = owner_id);

drop policy if exists "documents_insert_own" on public.documents;
create policy "documents_insert_own"
  on public.documents for insert
  to authenticated
  with check ((select auth.uid()) = owner_id);

drop policy if exists "documents_update_own" on public.documents;
create policy "documents_update_own"
  on public.documents for update
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists "documents_delete_own" on public.documents;
create policy "documents_delete_own"
  on public.documents for delete
  to authenticated
  using ((select auth.uid()) = owner_id);

create or replace function public.set_document_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists documents_set_updated_at on public.documents;
create trigger documents_set_updated_at
  before update on public.documents
  for each row execute function public.set_document_updated_at();

create table if not exists public.document_shares (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(18), 'hex'),
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

create index if not exists document_shares_document_idx
  on public.document_shares (document_id);

alter table public.document_shares enable row level security;

drop policy if exists "shares_select_owner" on public.document_shares;
create policy "shares_select_owner"
  on public.document_shares for select
  to authenticated
  using (
    created_by = (select auth.uid())
    or exists (
      select 1 from public.documents d
      where d.id = document_id and d.owner_id = (select auth.uid())
    )
  );

drop policy if exists "shares_insert_owner" on public.document_shares;
create policy "shares_insert_owner"
  on public.document_shares for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and exists (
      select 1 from public.documents d
      where d.id = document_id and d.owner_id = (select auth.uid())
    )
  );

drop policy if exists "shares_delete_owner" on public.document_shares;
create policy "shares_delete_owner"
  on public.document_shares for delete
  to authenticated
  using (
    created_by = (select auth.uid())
    or exists (
      select 1 from public.documents d
      where d.id = document_id and d.owner_id = (select auth.uid())
    )
  );

create or replace function public.get_shared_document(share_token text)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', d.id,
    'title', d.title,
    'content', d.content,
    'updated_at', d.updated_at
  )
  from public.document_shares s
  join public.documents d on d.id = s.document_id
  where s.token = share_token
    and (s.expires_at is null or s.expires_at > now())
  limit 1;
$$;

revoke all on function public.get_shared_document(text) from public;
grant execute on function public.get_shared_document(text) to anon, authenticated;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.documents to authenticated;
grant select, insert, delete on public.document_shares to authenticated;

notify pgrst, 'reload schema';
