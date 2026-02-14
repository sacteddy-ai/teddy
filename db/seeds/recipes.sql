insert into recipes (id, recipe_name, chef, tags) values
('r001', 'Kimchi Fried Rice', 'Chef Min Signature', array['korean', 'quick', 'pan']),
('r002', 'Soft Tofu Stew', 'Chef Han Home Style', array['korean', 'stew', 'comfort']),
('r003', 'Egg Roll Omelette', 'Chef Park Brunch', array['breakfast', 'quick', 'pan']),
('r004', 'Chicken Stir Fry', 'Chef Lee Wok', array['stir-fry', 'dinner', 'protein']),
('r005', 'Beef Potato Soup', 'Chef Jang Classic', array['soup', 'dinner', 'warm']),
('r006', 'Tofu Kimchi Bowl', 'Chef Yoon Studio', array['bowl', 'quick', 'korean']),
('r007', 'Pork Onion Rice Bowl', 'Chef Song Street', array['rice-bowl', 'dinner', 'protein']),
('r008', 'Creamy Milk Omelette', 'Chef Choi Brunch', array['breakfast', 'brunch', 'quick']),
('r009', 'Apple Potato Salad', 'Chef Kim Deli', array['salad', 'side', 'cold']),
('r010', 'Simple Kimchi Soup', 'Chef Min Signature', array['soup', 'korean', 'quick'])
on conflict (id) do update set
  recipe_name = excluded.recipe_name,
  chef = excluded.chef,
  tags = excluded.tags,
  updated_at = now();

insert into recipe_ingredients (recipe_id, ingredient_key, is_optional) values
('r001', 'kimchi', false), ('r001', 'egg', false), ('r001', 'green_onion', false),
('r001', 'pork', true), ('r001', 'onion', true),

('r002', 'tofu', false), ('r002', 'egg', false), ('r002', 'green_onion', false),
('r002', 'pork', true), ('r002', 'kimchi', true), ('r002', 'onion', true),

('r003', 'egg', false), ('r003', 'green_onion', false), ('r003', 'onion', false),
('r003', 'milk', true),

('r004', 'chicken', false), ('r004', 'onion', false), ('r004', 'green_onion', false),
('r004', 'potato', true),

('r005', 'beef', false), ('r005', 'potato', false), ('r005', 'onion', false),
('r005', 'green_onion', true),

('r006', 'tofu', false), ('r006', 'kimchi', false),
('r006', 'egg', true), ('r006', 'green_onion', true),

('r007', 'pork', false), ('r007', 'onion', false),
('r007', 'egg', true), ('r007', 'green_onion', true),

('r008', 'egg', false), ('r008', 'milk', false),
('r008', 'onion', true), ('r008', 'green_onion', true),

('r009', 'apple', false), ('r009', 'potato', false), ('r009', 'egg', false),
('r009', 'onion', true),

('r010', 'kimchi', false), ('r010', 'onion', false), ('r010', 'green_onion', false),
('r010', 'tofu', true), ('r010', 'pork', true)
on conflict (recipe_id, ingredient_key, is_optional) do nothing;
