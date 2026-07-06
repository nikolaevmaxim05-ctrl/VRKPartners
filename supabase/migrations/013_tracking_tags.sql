-- ============================================================================
-- Migration 013: tracking_tags — мульти-теги Google (GA4 / GTM / AW)
-- ----------------------------------------------------------------------------
-- Заказчику нужно подключать произвольное количество тегов трёх типов и
-- управлять ими из админки без деплоя (промпт 015):
--   - ga4 (G-XXXXXXX)  — прямой gtag.js
--   - gtm (GTM-XXXXXXX) — контейнер Google Tag Manager
--   - aw  (AW-XXXXXXXXX) — конверсионный тег Google Ads
--
-- RLS по образцу остальных админских таблиц (003): service_role — полный
-- доступ, authenticated — только чтение. Лендинг читает через service client.
-- ============================================================================

CREATE TABLE IF NOT EXISTS tracking_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('ga4','gtm','aw')),
  tag_id text NOT NULL,            -- "G-...", "GTM-...", "AW-..."
  label text,                      -- человекочитаемая пометка
  enabled boolean NOT NULL DEFAULT true,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Один и тот же тег не должен быть заведён дважды (и делает seed идемпотентным)
CREATE UNIQUE INDEX IF NOT EXISTS uq_tracking_tags_tag_id ON tracking_tags (tag_id);

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE tracking_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_tracking_tags" ON tracking_tags;
CREATE POLICY "service_role_tracking_tags" ON tracking_tags
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "authenticated_read_tracking_tags" ON tracking_tags;
CREATE POLICY "authenticated_read_tracking_tags" ON tracking_tags
  FOR SELECT USING (auth.role() = 'authenticated');

-- ── Seed: реальные теги из ТЗ заказчика ─────────────────────────────────────
-- В ТЗ GA4-снипет противоречив: загрузчик gtag/js?id=G-RKZ8L07EGG, но
-- gtag('config', 'G-KT20JBL2ZN'). Засчитывается config-ID, поэтому
-- G-KT20JBL2ZN включаем, G-RKZ8L07EGG заводим выключенным до уточнения.
INSERT INTO tracking_tags (type, tag_id, label, enabled, position) VALUES
  ('gtm', 'GTM-W67RBNZC',   'Основний контейнер GTM',          true,  0),
  ('ga4', 'G-KT20JBL2ZN',   'GA4 (config з ТЗ)',               true,  1),
  ('ga4', 'G-RKZ8L07EGG',   'GA4 (loader з ТЗ — уточнюється)', false, 2),
  ('aw',  'AW-16833775285', 'Google Ads',                      true,  3)
ON CONFLICT (tag_id) DO NOTHING;
