-- 031_tracking_tags_conversion_label.sql — Фаза 5 (розділ 5 стандарту, «Google-теги»).
--
-- tracking_tags.conversion_label — друга половина send_to (`AW-XXXXXXXXX/LABEL`) для тега Google Ads.
-- Без label відправка форми не викликає конверсію Ads, і Enhanced Conversions нема до чого
-- привʼязатися. Для ga4/gtm поле порожнє (API віддає 400). Ідемпотентно; колонка додаткова —
-- можна застосувати ДО деплою коду Фази 5 (старий код її не читає).

alter table public.tracking_tags add column if not exists conversion_label text;

comment on column public.tracking_tags.conversion_label is 'Google Ads conversion label (send_to = tag_id/label); лише для type = aw';
