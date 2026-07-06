-- 014_analytics_events_seed.sql
-- Сід таксономії подій аналітики (промпт 021).
-- Повторне застосування безпечне — ON CONFLICT (key) DO UPDATE перезаписує значення.
-- lead_value НЕ сидується — задається адміністратором вручну через /admin/settings.
--
-- Таксономія замовника:
--   enabled:true  → події GTM, які вже відстежуються (Google Ads, GA4)
--   enabled:false → точки вимкнені (залишаються з дефолтними іменами для GTM)
--
-- ВАЖЛИВО: call_back_form_success — латиницею (не «с» кирилицею, яка була в ТЗ — опечатка).

INSERT INTO site_settings (key, value, type, updated_at)
VALUES (
  'analytics_events',
  $json${
    "header_cta_click":          { "enabled": false, "eventNames": ["cta_click"] },
    "header_nav_click":          { "enabled": false, "eventNames": ["nav_click"] },
    "header_phone_click":        { "enabled": true,  "eventNames": ["click_to_call"] },
    "mobile_menu_cta_click":     { "enabled": false, "eventNames": ["cta_click"] },
    "mobile_menu_nav_click":     { "enabled": false, "eventNames": ["nav_click"] },
    "mobile_menu_phone_click":   { "enabled": true,  "eventNames": ["click_to_call"] },
    "sticky_cta_click":          { "enabled": false, "eventNames": ["sticky_cta_click"] },
    "services_cta_click":        { "enabled": false, "eventNames": ["cta_click"] },
    "service_card_click":        { "enabled": false, "eventNames": ["service_card_click"] },
    "service_hero_cta_click":    { "enabled": false, "eventNames": ["cta_click"] },
    "service_pricing_cta_click": { "enabled": false, "eventNames": ["cta_click"] },
    "pricing_cta_click":         { "enabled": false, "eventNames": ["cta_click"] },
    "faq_open":                  { "enabled": false, "eventNames": ["faq_open"] },
    "form_open":                 { "enabled": true,  "eventNames": ["form_open"] },
    "quick_form_start":          { "enabled": true,  "eventNames": ["form_start", "lead_form_started"] },
    "main_form_start":           { "enabled": true,  "eventNames": ["form_start", "lead_form_started"] },
    "quick_form_submit_attempt": { "enabled": true,  "eventNames": ["form_sent"] },
    "main_form_submit_attempt":  { "enabled": true,  "eventNames": ["form_sent"] },
    "quick_form_submit_success": { "enabled": true,  "eventNames": ["call_back_form_success"] },
    "main_form_submit_success":  { "enabled": true,  "eventNames": ["form_submitted", "generate_lead"] },
    "quick_form_submit_error":   { "enabled": true,  "eventNames": ["form_submission_error"] },
    "main_form_submit_error":    { "enabled": true,  "eventNames": ["form_submission_error"] },
    "floating_telegram_click":   { "enabled": true,  "eventNames": ["telegram_click"] },
    "viber_click":               { "enabled": true,  "eventNames": ["click_viber"] },
    "whatsapp_click":            { "enabled": true,  "eventNames": ["click_whatsapp"] },
    "telegram_click":            { "enabled": true,  "eventNames": ["telegram_click"] },
    "contacts_phone_click":      { "enabled": true,  "eventNames": ["click_to_call"] },
    "contacts_email_click":      { "enabled": true,  "eventNames": ["click_email"] },
    "email_copied":              { "enabled": true,  "eventNames": ["email_copied"] },
    "reviews_click":             { "enabled": true,  "eventNames": ["click_on_reviews"] },
    "footer_nav_click":          { "enabled": false, "eventNames": ["nav_click"] },
    "footer_phone_click":        { "enabled": true,  "eventNames": ["click_to_call"] },
    "footer_email_click":        { "enabled": true,  "eventNames": ["click_email"] },
    "footer_telegram_click":     { "enabled": true,  "eventNames": ["telegram_click"] },
    "facebook_click":            { "enabled": true,  "eventNames": ["click_facebook"] },
    "instagram_click":           { "enabled": false, "eventNames": ["instagram_click"] },
    "phone_click":               { "enabled": true,  "eventNames": ["click_to_call"] },
    "email_click":               { "enabled": true,  "eventNames": ["click_email"] },
    "page_404":                  { "enabled": true,  "eventNames": ["404_page_not_found"] }
  }$json$,
  'json',
  now()
)
ON CONFLICT (key) DO UPDATE
  SET value      = EXCLUDED.value,
      updated_at = now();
