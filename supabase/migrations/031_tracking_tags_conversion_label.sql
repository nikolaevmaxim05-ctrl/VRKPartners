-- 031_tracking_tags_conversion_label.sql — Фаза 5 (раздел 5 стандарта, «Google-теги»).
--
-- tracking_tags.conversion_label — вторая половина send_to (`AW-XXXXXXXXX/LABEL`) для тега Google Ads.
-- Без label отправка формы не вызывает конверсию Ads, и Enhanced Conversions не к чему
-- привязаться. Для ga4/gtm поле пустое (API отдаёт 400). Идемпотентно; колонка дополнительная —
-- можно применить ДО деплоя кода Фазы 5 (старый код её не читает).

alter table public.tracking_tags add column if not exists conversion_label text;

comment on column public.tracking_tags.conversion_label is 'Google Ads conversion label (send_to = tag_id/label); лише для type = aw';
