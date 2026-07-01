# 포인트 광산

카카오 계정으로 로그인해 곡괭이를 장착하고 광물을 채굴·선택 판매하며, 광물로 곡괭이를 수리하고 상점에서 곡괭이 상자를 구매하는 Vite + React 웹앱입니다.

## 로컬 실행

```bash
npm install
copy .env.example .env.local
npm run dev
```

`.env.local`에 다음 값을 설정합니다.

```env
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_KEY=sb_publishable_your_key
```

`SUPABASE_KEY`에는 브라우저 공개가 가능한 Supabase publishable key만 사용합니다. secret 또는 service role key를 넣으면 안 됩니다.

## Supabase 설정

Supabase SQL Editor에서 다음 파일을 순서대로 실행합니다.

1. `supabase/pointmine_setup.sql`
2. `supabase/pointmine_shop_update.sql`
3. `supabase/pointmine_inventory_actions_update.sql`
4. `supabase/pointmine_balance_update.sql`
5. `supabase/pointmine_repair_balance_update.sql`

이미 앞선 SQL을 적용한 프로젝트라면 새로 추가된 4번과 5번 SQL만 순서대로 실행하면 됩니다.

이후 Authentication > Providers에서 Kakao를 활성화하고 Kakao Developers에 Supabase 콜백 URL `https://<project-ref>.supabase.co/auth/v1/callback`을 등록합니다. Supabase URL Configuration의 Redirect URLs에는 로컬 주소와 Vercel 배포 주소를 등록합니다.

기존 테이블에는 다음 정산 데이터가 필요합니다.

- `companies.name = '엘케이컴퍼니'`
- `companies.name = '익테봇'`
- `users.nickname = '로또기금'`

상점 구매 금액은 엘케이컴퍼니 98%, 익테봇 1%, 로또기금 1%로 한 트랜잭션에서 분배합니다.

- [곡괭이 상자 표시 확률표](docs/chest-probabilities.md)
- [곡괭이별 채굴 기대 수익](docs/mining-expected-values.md)
- [곡괭이 수리 비용표](docs/repair-recipes.md)

## Vercel 배포

Vercel 프로젝트 환경변수에 `SUPABASE_URL`, `SUPABASE_KEY`를 등록하고 배포합니다. 빌드 명령은 `npm run build`, 출력 디렉터리는 `dist`입니다.

## 검증

```bash
npm run lint
npm run build
```
