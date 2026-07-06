-- Block: deal_amount_type setting
-- Визначає яке поле (deal_amount або deal_profit) вважається сумою конверсії.
INSERT INTO site_settings (key, value, type) VALUES
  ('deal_amount_type', 'amount', 'string')
ON CONFLICT (key) DO NOTHING;
