-- RLB Managerspiel: Datenbankschema (PostgreSQL)
-- Alle Spieltage bleiben einzeln gespeichert; Summen werden berechnet, nie überschrieben.

create table if not exists settings (
  key text primary key,
  value jsonb not null
);

create table if not exists managers (
  id serial primary key,
  name text not null unique,
  sort int not null default 0,
  active boolean not null default true
);

create table if not exists users (
  id serial primary key,
  email text not null unique,
  name text not null,
  role text not null check (role in ('admin','manager')),
  manager_id int references managers(id),
  password_hash text not null,
  must_change_pw boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists clubs (
  id text primary key,            -- Kurzname wie im Spiel, z. B. 'Bayern'
  oldb_team_id int unique,        -- OpenLigaDB teamId
  full_name text
);

create table if not exists players (
  id text primary key,
  manager_id int not null references managers(id),
  name text not null,
  club text,                                 -- Vereinsname; Ersatzspieler dürfen aus anderen Ligen stammen (4.3.2)
  base_pos char(1) not null check (base_pos in ('T','V','M','S')),
  extra_pos text[] not null default '{}',   -- erworbene Zusatzpositionen (Ziff. 5.2)
  price numeric(6,1) not null default 0,     -- Wert (Draftpreis / Kaufpreis)
  slot text not null default 'bank' check (slot in ('stamm','bank')),
  source text not null default 'draft' check (source in ('draft','kauf','trade')),
  status text not null default 'active' check (status in ('active','released','abgang')),
  valid_from int not null default 1,         -- erste Runde, in der der Spieler zählt
  valid_to int,                              -- letzte Runde, in der der Spieler zählt (null = offen)
  jugend boolean not null default false,     -- Jugendspieler-Status (Ziff. 4.3.4)
  contract text check (contract in ('1J','2J')),
  contract_mandatory boolean not null default false,
  note text
);
create index if not exists players_manager on players(manager_id);

create table if not exists rounds (
  id serial primary key,                    -- Rundennummer in Spielreihenfolge (1..n, Nachträge dazwischen möglich)
  number int not null unique,                -- Reihenfolge der Wertung
  type text not null default 'regulaer' check (type in ('regulaer','nachtrag')),
  label text not null,
  matchday int,                              -- Bundesliga-Spieltag (OpenLigaDB group)
  match_ids int[] not null default '{}',     -- zugehörige Spiele
  deadline timestamptz,                      -- 90 Min. vor Anpfiff des ersten Spiels (Ziff. 5.1 / 7.1)
  deadline_manual boolean not null default false,
  status text not null default 'open' check (status in ('open','final')),
  tdr text[] not null default '{}',          -- Team der Runde (kicker)
  sdt text,                                  -- Spieler des Tages
  bids_resolved boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists matches (
  id int primary key,                        -- OpenLigaDB matchID
  matchday int not null,
  round_id int references rounds(id),
  kickoff timestamptz,
  team1 int, team2 int,                      -- OpenLigaDB teamIds
  finished boolean not null default false,
  goals1 int, goals2 int,
  goals jsonb not null default '[]',      -- Torschützen laut OpenLigaDB
  updated_at timestamptz not null default now()
);

create table if not exists lineups (
  round_id int not null references rounds(id),
  manager_id int not null references managers(id),
  entries jsonb not null default '{}',       -- {player_id: {pos:'V'}}
  free_in text[] not null default '{}',      -- gratis eingewechselt (Eventualauftrag, Ziff. 7.1)
  updated_at timestamptz not null default now(),
  updated_by int references users(id),
  primary key (round_id, manager_id)
);

create table if not exists results (
  round_id int not null references rounds(id),
  player_id text not null references players(id),
  start smallint not null default 0,         -- 0 nicht gespielt, 1 Startelf, 2 eingewechselt
  assist smallint not null default 0,
  tore smallint not null default 0,
  karten smallint not null default 0,        -- Strafpunkte: Gelb 1, Gelb-Rot 2, Rot 3, Rot mit Gelb 4
  tdr smallint not null default 0,
  locked boolean not null default false,       -- vom Admin geändert: Import überschreibt nicht
  source text,                                 -- 'kicker' | 'oldb' | 'admin' | 'excel'
  kpos char(1),                                -- Position laut kicker-Aufstellung in dieser Runde (Ziff. 5.2)
  primary key (round_id, player_id)
);

create table if not exists corrections (
  id serial primary key,
  round_id int not null references rounds(id),
  manager_id int not null references managers(id),
  text text not null,
  delta jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists bids (
  id serial primary key,
  round_id int not null references rounds(id),
  manager_id int not null references managers(id),
  player_name text not null,
  club text,
  pos char(1) not null,
  price int not null,
  release_player_id text references players(id),
  swap_out_player_id text references players(id),  -- Eventualauftrag: wird ersetzt
  status text not null default 'sealed' check (status in ('sealed','won','lost','invalid')),
  reason text,
  created_at timestamptz not null default now(),
  unique (round_id, manager_id)
);

create table if not exists trades (
  id serial primary key,
  from_manager int not null references managers(id),
  to_manager int not null references managers(id),
  give text[] not null,
  get_ text[] not null,
  status text not null default 'proposed' check (status in ('proposed','done','rejected','reverted')),
  vetos int[] not null default '{}',
  round_id int references rounds(id),
  created_at timestamptz not null default now(),
  done_at timestamptz
);

create table if not exists ledger (
  id serial primary key,
  manager_id int not null references managers(id),
  round_id int references rounds(id),
  type text not null,                        -- draft, vertragsaufloesung, kauf, wechsel, trade, gutschrift, sonstiges
  amount numeric(7,2) not null,
  text text,
  created_at timestamptz not null default now()
);

create table if not exists transfers (
  id serial primary key,
  round_id int references rounds(id),
  manager_id int not null references managers(id),
  type text not null,                        -- kauf, entlassung, trade, abgang, tausch
  player_name text not null,
  price numeric(6,1) not null default 0,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists finance (
  manager_id int primary key references managers(id),
  paid numeric(7,2) not null default 0
);

create table if not exists audit (
  id serial primary key,
  user_id int,
  action text not null,
  detail jsonb,
  created_at timestamptz not null default now()
);

alter table matches add column if not exists goals jsonb not null default '[]';
alter table results add column if not exists locked boolean not null default false;
alter table results add column if not exists source text;
alter table results add column if not exists kpos char(1);

-- Spielerpool Bundesliga (aus kicker-Aufstellungen; Grundlage für Gebote auf freie Spieler)
create table if not exists bl_players (
  slug text primary key,
  name text not null,
  club text,
  pos char(1),
  last_matchday int,
  games int not null default 0,
  updated_at timestamptz not null default now()
);
alter table bl_players add column if not exists first_name text;
alter table bl_players add column if not exists in_squad boolean not null default false;
alter table bl_players add column if not exists squad_pos char(1);
alter table bl_players add column if not exists seen_at timestamptz;
alter table bl_players add column if not exists left_at timestamptz;
-- Protokoll der Kaderänderungen laut kicker (täglicher Abgleich)
create table if not exists squad_log (
  id serial primary key,
  at timestamptz not null default now(),
  type text not null,            -- zugang | abgang | wechsel | position
  slug text not null,
  name text not null,
  club_from text,
  club_to text,
  pos_from char(1),
  pos_to char(1),
  rlb_player_id text             -- betroffener RLB-Spieler (falls in einem Kader)
);

alter table bl_players add column if not exists played_pos char(1)[] not null default '{}';
