create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.is_room_member(target_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.room_seats
    where room_id = target_room_id
      and user_id = auth.uid()
  );
$$;

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z2-9]{6}$'),
  host_user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'waiting' check (status in ('waiting', 'active', 'finished', 'abandoned')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null default timezone('utc', now()) + interval '7 days',
  last_event_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.room_seats (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  seat_role text not null check (seat_role in ('host', 'guest')),
  user_id uuid not null references auth.users (id) on delete cascade,
  nickname text not null check (char_length(nickname) between 2 and 18),
  is_ready boolean not null default false,
  joined_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (room_id, seat_role),
  unique (room_id, user_id)
);

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  game_number integer not null,
  status text not null default 'waiting' check (status in ('waiting', 'active', 'finished')),
  board_rows jsonb not null default '["...............","...............","...............","...............","...............","...............","...............","...............","...............","...............","...............","...............","...............","...............","..............."]'::jsonb,
  move_count integer not null default 0,
  next_player text not null default 'black' check (next_player in ('black', 'white')),
  black_user_id uuid not null references auth.users (id) on delete cascade,
  white_user_id uuid not null references auth.users (id) on delete cascade,
  black_nickname text not null,
  white_nickname text not null,
  winner text check (winner in ('black', 'white')),
  result_reason text check (result_reason in ('five', 'timeout', 'resign', 'draw')),
  winning_line jsonb not null default '[]'::jsonb,
  deadline_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (room_id, game_number)
);

create table if not exists public.moves (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  move_index integer not null,
  x smallint not null check (x between 0 and 14),
  y smallint not null check (y between 0 and 14),
  color text not null check (color in ('black', 'white')),
  player_id uuid not null references auth.users (id) on delete cascade,
  player_nickname text not null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (game_id, move_index)
);

create table if not exists public.rematch_votes (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  game_id uuid not null references public.games (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  unique (game_id, user_id)
);

create table if not exists public.room_events (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.rooms (id) on delete cascade,
  room_code text not null,
  event_type text not null,
  payload jsonb not null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_room_seats_room on public.room_seats (room_id);
create index if not exists idx_games_room on public.games (room_id, game_number desc);
create index if not exists idx_moves_game on public.moves (game_id, move_index);
create index if not exists idx_rematch_votes_game on public.rematch_votes (game_id);
create index if not exists idx_room_events_room_code on public.room_events (room_code, created_at desc);

drop trigger if exists rooms_set_updated_at on public.rooms;
create trigger rooms_set_updated_at
before update on public.rooms
for each row
execute function public.set_updated_at();

drop trigger if exists room_seats_set_updated_at on public.room_seats;
create trigger room_seats_set_updated_at
before update on public.room_seats
for each row
execute function public.set_updated_at();

drop trigger if exists games_set_updated_at on public.games;
create trigger games_set_updated_at
before update on public.games
for each row
execute function public.set_updated_at();

alter table public.rooms enable row level security;
alter table public.room_seats enable row level security;
alter table public.games enable row level security;
alter table public.moves enable row level security;
alter table public.rematch_votes enable row level security;
alter table public.room_events enable row level security;

drop policy if exists "rooms_select_for_members" on public.rooms;
create policy "rooms_select_for_members"
on public.rooms
for select
to authenticated
using (public.is_room_member(id));

drop policy if exists "room_seats_select_for_members" on public.room_seats;
create policy "room_seats_select_for_members"
on public.room_seats
for select
to authenticated
using (public.is_room_member(room_id));

drop policy if exists "games_select_for_members" on public.games;
create policy "games_select_for_members"
on public.games
for select
to authenticated
using (public.is_room_member(room_id));

drop policy if exists "moves_select_for_members" on public.moves;
create policy "moves_select_for_members"
on public.moves
for select
to authenticated
using (
  exists (
    select 1
    from public.games
    where public.games.id = public.moves.game_id
      and public.is_room_member(public.games.room_id)
  )
);

drop policy if exists "rematch_votes_select_for_members" on public.rematch_votes;
create policy "rematch_votes_select_for_members"
on public.rematch_votes
for select
to authenticated
using (public.is_room_member(room_id));

drop policy if exists "room_events_select_for_members" on public.room_events;
create policy "room_events_select_for_members"
on public.room_events
for select
to authenticated
using (public.is_room_member(room_id));

drop policy if exists "presence_read_for_room_members" on realtime.messages;
create policy "presence_read_for_room_members"
on realtime.messages
for select
to authenticated
using (
  exists (
    select 1
    from public.rooms
    join public.room_seats on public.room_seats.room_id = public.rooms.id
    where public.room_seats.user_id = auth.uid()
      and public.rooms.code = split_part(realtime.topic(), ':', 2)
      and realtime.messages.extension in ('presence')
  )
);

drop policy if exists "presence_write_for_room_members" on realtime.messages;
create policy "presence_write_for_room_members"
on realtime.messages
for insert
to authenticated
with check (
  exists (
    select 1
    from public.rooms
    join public.room_seats on public.room_seats.room_id = public.rooms.id
    where public.room_seats.user_id = auth.uid()
      and public.rooms.code = split_part(realtime.topic(), ':', 2)
      and realtime.messages.extension in ('presence')
  )
);

do $$
begin
  alter publication supabase_realtime add table public.room_events;
exception
  when duplicate_object then null;
end;
$$;
