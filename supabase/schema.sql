-- ============================================================
--  오운완 (OUNWAN) — Supabase 스키마 + RLS
--  Supabase 대시보드 > SQL Editor 에 붙여넣고 RUN 하세요.
--  로컬퍼스트 설계: 각 레코드를 JSONB 문서로 저장하고
--  id / owner_id / updated_at / deleted_at 만 최상위 컬럼으로 둡니다.
-- ============================================================

-- 공통 테이블 생성 매크로 대신 5개 테이블을 명시적으로 정의합니다.

create table if not exists public.profiles (
  id          text primary key,
  owner_id    uuid not null references auth.users(id) on delete cascade,
  data        jsonb not null,
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create table if not exists public.exercises (
  id          text primary key,
  owner_id    uuid not null references auth.users(id) on delete cascade,
  data        jsonb not null,
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create table if not exists public.routines (
  id          text primary key,
  owner_id    uuid not null references auth.users(id) on delete cascade,
  data        jsonb not null,
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create table if not exists public.sessions (
  id          text primary key,
  owner_id    uuid not null references auth.users(id) on delete cascade,
  data        jsonb not null,
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create table if not exists public.body_metrics (
  id          text primary key,
  owner_id    uuid not null references auth.users(id) on delete cascade,
  data        jsonb not null,
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

-- 동기화 pull 성능용 인덱스 (owner_id, updated_at)
create index if not exists idx_profiles_owner_upd     on public.profiles     (owner_id, updated_at);
create index if not exists idx_exercises_owner_upd    on public.exercises    (owner_id, updated_at);
create index if not exists idx_routines_owner_upd     on public.routines     (owner_id, updated_at);
create index if not exists idx_sessions_owner_upd     on public.sessions     (owner_id, updated_at);
create index if not exists idx_body_metrics_owner_upd on public.body_metrics (owner_id, updated_at);

-- ---------- RLS: 본인 데이터만 접근 ----------
do $$
declare t text;
begin
  foreach t in array array['profiles','exercises','routines','sessions','body_metrics']
  loop
    execute format('alter table public.%I enable row level security;', t);

    execute format('drop policy if exists "own_select" on public.%I;', t);
    execute format('create policy "own_select" on public.%I for select using (owner_id = auth.uid());', t);

    execute format('drop policy if exists "own_insert" on public.%I;', t);
    execute format('create policy "own_insert" on public.%I for insert with check (owner_id = auth.uid());', t);

    execute format('drop policy if exists "own_update" on public.%I;', t);
    execute format('create policy "own_update" on public.%I for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());', t);

    execute format('drop policy if exists "own_delete" on public.%I;', t);
    execute format('create policy "own_delete" on public.%I for delete using (owner_id = auth.uid());', t);
  end loop;
end $$;

-- ---------- (선택) 실시간 동기화용 publication ----------
-- 다른 기기의 변경을 즉시 반영하려면 아래를 실행하세요. 실패해도 앱 동작에는 문제 없습니다.
do $$
begin
  alter publication supabase_realtime add table public.profiles;
  alter publication supabase_realtime add table public.exercises;
  alter publication supabase_realtime add table public.routines;
  alter publication supabase_realtime add table public.sessions;
  alter publication supabase_realtime add table public.body_metrics;
exception when others then
  raise notice 'realtime publication 설정 생략(이미 추가되었거나 권한 이슈): %', sqlerrm;
end $$;
