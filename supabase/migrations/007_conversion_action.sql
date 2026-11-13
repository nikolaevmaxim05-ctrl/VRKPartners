-- ============================================================================
-- Migration 007: conversion_action column on lead_statuses
-- ----------------------------------------------------------------------------
-- Позволяет каждому статусу иметь свой Google Ads Conversion Name.
-- При смене статуса лида — в Sheets и offline_conversions записывается
-- conversion_action из этого статуса (не глобальный из site_settings).
-- Если NULL — фолбэк на site_settings.google_ads_conversion_action.
-- ============================================================================

ALTER TABLE lead_statuses
  ADD COLUMN IF NOT EXISTS conversion_action TEXT;

-- Системные статусы → три event-action-а по ТЗ
UPDATE lead_statuses SET conversion_action = 'purchase_offline'
  WHERE name = 'Угода';

UPDATE lead_statuses SET conversion_action = 'interested_lead_offline'
  WHERE name = 'Цільовий лід';

UPDATE lead_statuses SET conversion_action = 'non_interested_lead_offline'
  WHERE name = 'Нецільовий лід';

-- «Новий клієнт», «Взято в роботу», «НДЗ» — conversion_action = NULL (конверсию не пишем)
