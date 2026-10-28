-- Run once in the TMFL Supabase project's SQL Editor.
-- Authenticated fans can cast one vote per poll, and change it later.
create table if not exists public.tmfl_fan_poll_votes (
  poll_id text not null,
  voter_id uuid not null references auth.users(id) on delete cascade,
  choice text not null,
  updated_at timestamptz not null default now(),
  primary key (poll_id, voter_id),
  constraint tmfl_poll_id_valid check (poll_id in ('champion','gotw')),
  constraint tmfl_poll_choice_length check (length(choice) between 1 and 64)
);
alter table public.tmfl_fan_poll_votes enable row level security;
revoke all on public.tmfl_fan_poll_votes from anon, authenticated;
create or replace function public.tmfl_cast_poll_vote(p_poll_id text, p_choice text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Sign in to vote'; end if;
  if p_poll_id not in ('champion','gotw') or length(p_choice) not between 1 and 64 then
    raise exception 'Invalid poll vote';
  end if;
  insert into public.tmfl_fan_poll_votes(poll_id,voter_id,choice)
  values(p_poll_id,auth.uid(),p_choice)
  on conflict (poll_id,voter_id) do update
    set choice=excluded.choice, updated_at=now();
end;
$$;
create or replace function public.tmfl_get_poll_results()
returns jsonb language sql stable security definer set search_path = ''
as $$
 select coalesce(jsonb_object_agg(poll_id,counts),'{}'::jsonb)
 from (
  select poll_id,jsonb_object_agg(choice,n) as counts
  from (select poll_id,choice,count(*)::integer as n
        from public.tmfl_fan_poll_votes group by poll_id,choice) tally
  group by poll_id
 ) per_poll;
$$;
create or replace function public.tmfl_get_my_poll_votes()
returns jsonb language sql stable security definer set search_path = ''
as $$
 select coalesce(jsonb_object_agg(poll_id,choice),'{}'::jsonb)
 from public.tmfl_fan_poll_votes where voter_id=auth.uid();
$$;
revoke all on function public.tmfl_cast_poll_vote(text,text) from public;
revoke all on function public.tmfl_get_poll_results() from public;
revoke all on function public.tmfl_get_my_poll_votes() from public;
grant execute on function public.tmfl_cast_poll_vote(text,text) to authenticated;
grant execute on function public.tmfl_get_poll_results() to anon,authenticated;
grant execute on function public.tmfl_get_my_poll_votes() to authenticated;
