-- 수리 재료의 판매 기회비용이 채굴 기대 수익을 넘지 않도록 수리표를 재조정합니다.
-- pointmine_balance_update.sql 적용 후 Supabase SQL Editor에서 전체 스크립트를 실행합니다.

begin;

delete from public.pointmine_repair_costs;

insert into public.pointmine_repair_costs (pickaxe_id, ore_id, quantity_per_durability)
values
  ('stone', 'stone', 2),
  ('rusty_iron', 'coal', 1),
  ('bronze', 'copper', 1),
  ('steel', 'iron', 1),
  ('gold', 'coal', 2),
  ('titanium', 'silver', 1),
  ('platinum', 'silver', 2),
  ('obsidian', 'jade', 1),
  ('alloy', 'obsidian', 1),
  ('ruby', 'amethyst', 1),
  ('sapphire', 'amethyst', 1),
  ('orichalcum', 'amethyst', 1),
  ('adamantium', 'amethyst', 1),
  ('astral', 'emerald', 1),
  ('master', 'diamond', 1);

commit;
