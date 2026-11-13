-- Block: deal_amount_type setting
-- Определяет, какое поле (deal_amount или deal_profit) считается суммой конверсии.
INSERT INTO site_settings (key, value, type) VALUES
  ('deal_amount_type', 'amount', 'string')
ON CONFLICT (key) DO NOTHING;
