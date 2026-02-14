insert into ingredient_shelf_life_rules (
  ingredient_key,
  ingredient_display_name,
  storage_type,
  condition_type,
  min_days,
  max_days,
  avg_days,
  confidence,
  source
) values
('milk', '우유', 'refrigerated', 'unopened', 5, 7, 6, 'medium', 'internal.v1'),
('milk', '우유', 'refrigerated', 'opened', 2, 4, 3, 'medium', 'internal.v1'),

('egg', '달걀', 'refrigerated', 'unopened', 21, 35, 28, 'high', 'internal.v1'),
('egg', '달걀', 'room', 'unopened', 7, 10, 8, 'medium', 'internal.v1'),

('tofu', '두부', 'refrigerated', 'unopened', 7, 14, 10, 'medium', 'internal.v1'),
('tofu', '두부', 'refrigerated', 'opened', 2, 3, 2, 'medium', 'internal.v1'),

('pork', '돼지고기', 'refrigerated', 'unopened', 2, 3, 2, 'medium', 'internal.v1'),
('pork', '돼지고기', 'frozen', 'unopened', 90, 180, 120, 'medium', 'internal.v1'),

('bacon', '베이컨', 'refrigerated', 'unopened', 7, 14, 10, 'medium', 'internal.v1'),
('bacon', '베이컨', 'refrigerated', 'opened', 5, 7, 6, 'medium', 'internal.v1'),

('chicken', '닭고기', 'refrigerated', 'unopened', 1, 2, 1, 'medium', 'internal.v1'),
('chicken', '닭고기', 'frozen', 'unopened', 180, 270, 210, 'medium', 'internal.v1'),

('beef', '소고기', 'refrigerated', 'unopened', 3, 5, 4, 'medium', 'internal.v1'),
('beef', '소고기', 'frozen', 'unopened', 180, 365, 270, 'medium', 'internal.v1'),

('lettuce', '상추', 'refrigerated', 'unopened', 3, 7, 5, 'low', 'internal.v1'),
('spinach', '시금치', 'refrigerated', 'unopened', 3, 5, 4, 'low', 'internal.v1'),
('green_onion', '대파', 'refrigerated', 'unopened', 7, 14, 10, 'low', 'internal.v1'),

('kimchi', '김치', 'refrigerated', 'opened', 30, 90, 60, 'medium', 'internal.v1'),
('kimchi', '김치', 'refrigerated', 'unopened', 60, 120, 90, 'medium', 'internal.v1'),

('apple', '사과', 'room', 'unopened', 7, 14, 10, 'low', 'internal.v1'),
('apple', '사과', 'refrigerated', 'unopened', 21, 42, 30, 'low', 'internal.v1'),

('onion', '양파', 'room', 'unopened', 30, 60, 45, 'medium', 'internal.v1'),
('potato', '감자', 'room', 'unopened', 30, 60, 45, 'medium', 'internal.v1'),

('default_perishable', '일반 신선식품', 'refrigerated', 'unopened', 3, 7, 5, 'low', 'internal.v1'),
('default_perishable', '일반 신선식품', 'refrigerated', 'opened', 1, 3, 2, 'low', 'internal.v1'),
('default_perishable', '일반 신선식품', 'room', 'unopened', 2, 5, 3, 'low', 'internal.v1'),
('default_perishable', '일반 신선식품', 'frozen', 'unopened', 30, 90, 60, 'low', 'internal.v1')
on conflict (ingredient_key, storage_type, condition_type) do update set
  ingredient_display_name = excluded.ingredient_display_name,
  min_days = excluded.min_days,
  max_days = excluded.max_days,
  avg_days = excluded.avg_days,
  confidence = excluded.confidence,
  source = excluded.source,
  updated_at = now();
