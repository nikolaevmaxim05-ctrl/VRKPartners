-- ============================================================================
-- Migration 007: conversion_action column on lead_statuses
-- ----------------------------------------------------------------------------
-- Дозволяє кожному статусу мати свій Google Ads Conversion Name.
-- При зміні статусу ліда — в Sheets і offline_conversions записується
-- conversion_action з цього статусу (не глобальний з site_settings).
-- Якщо NULL — фолбек на site_settings.google_ads_conversion_action.
-- ============================================================================

ALTER TABLE lead_statuses
  ADD COLUMN IF NOT EXISTS conversion_action TEXT;

-- Системні статуси → три event-action-и за ТЗ
UPDATE lead_statuses SET conversion_action = 'purchase_offline'
  WHERE name = 'Угода';

UPDATE lead_statuses SET conversion_action = 'interested_lead_offline'
  WHERE name = 'Цільовий лід';

UPDATE lead_statuses SET conversion_action = 'non_interested_lead_offline'
  WHERE name = 'Нецільовий лід';

-- 'Новий клієнт', 'Взято в роботу', 'НДЗ' — conversion_action = NULL (не пишемо конверсію)
