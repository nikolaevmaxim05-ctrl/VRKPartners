-- 027_storage_content_bucket.sql
-- Storage-bucket для кастомних зображень контенту (фото кейсів, бейджі тощо),
-- куди пише /api/admin/content/upload. Бакети НЕ створюються табличними
-- міграціями автоматично — при переїзді на новий Supabase-проєкт bucket 'content'
-- був відсутній, тож завантаження падало 500 («Bucket not found»). Ця міграція
-- створює bucket ідемпотентно, щоб наступний переїзд БД не наступив на ті ж граблі.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'content', 'content', true, 5242880,
  array['image/png','image/jpeg','image/webp','image/gif']
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Публічне читання об'єктів bucket 'content' (картинки видно на лендингу).
-- Запис/оновлення/видалення — лише service_role (обходить RLS). Окремих політик
-- для anon/authenticated НЕ додаємо, тож напряму через API вони писати не можуть.
drop policy if exists "content_public_read" on storage.objects;
create policy "content_public_read"
  on storage.objects for select
  to public
  using (bucket_id = 'content');
