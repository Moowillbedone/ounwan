# 동기화 서버(Supabase) 연결 가이드 — 2분

오운완은 서버 없이도 **게스트(로컬 전용)** 로 완전히 동작합니다.
아래는 **여러 기기에서 기록을 이어가는 동기화**를 켜고 싶을 때만 하면 됩니다.

## 1. Supabase 무료 프로젝트 만들기

1. https://supabase.com 접속 → 로그인 → **New project**
2. 프로젝트 이름(예: `ounwan`), DB 비밀번호 설정, 리전은 `Northeast Asia (Seoul)` 권장
3. 생성까지 1~2분 대기

## 2. 데이터베이스 스키마 실행

1. 좌측 메뉴 **SQL Editor** → **New query**
2. 이 저장소의 [`supabase/schema.sql`](./supabase/schema.sql) 내용을 **전체 복사** 후 붙여넣기
3. **Run** — 테이블 5개 + RLS 정책 + (선택)실시간 publication이 생성됩니다

## 3. 이메일 로그인 활성화 확인

- **Authentication → Providers → Email** 이 켜져 있는지 확인 (기본 ON)
- 매직링크(비밀번호 없는 로그인)를 사용합니다
- **Authentication → URL Configuration → Site URL** 에 배포 도메인 등록
  - 예: `https://ounwan-three.vercel.app`
- **Authentication → URL Configuration → Redirect URLs** 허용목록에도 같은 도메인 추가
  - `https://ounwan-three.vercel.app`
  - 로컬 개발용 `http://localhost:3000` 도 함께 추가
  - ⚠️ 매직링크는 접속한 주소(`window.location.origin`)로 되돌아옵니다. 실제 배포 도메인이 허용목록에 없으면 로그인 링크가 깨집니다.

## 4. API 키 가져오기

- **Project Settings → API**
  - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
  - `anon public` 키 → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

> anon key는 공개되어도 안전합니다(RLS로 본인 데이터만 접근). service_role 키는 절대 넣지 마세요.

## 5. 환경변수 설정

### 로컬
`.env.local.example` 을 복사해 `.env.local` 을 만들고 값을 채웁니다.

```bash
cp .env.local.example .env.local
# 편집기로 두 값 입력
npm run dev
```

### Vercel
프로젝트 → **Settings → Environment Variables** 에 동일한 두 변수를 추가하고 **재배포**합니다.

## 6. 사용

- 앱 상단/설정에서 **로그인** → 이메일 입력 → 메일의 링크 클릭
- 로그인하면 **지금까지의 로컬 기록이 계정으로 자동 이관**되고, 이후 모든 기기와 동기화됩니다.

---

문제가 생기면: 브라우저 콘솔에 `[sync]` 로그를 확인하세요. 스키마가 없거나 키가 틀리면 동기화만 조용히 멈추고, 기록 자체는 로컬에 안전하게 남습니다.
