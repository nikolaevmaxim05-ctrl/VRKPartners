-- 027_storage_content_bucket.sql
-- Storage-bucket для кастомных изображений контента (фото кейсов, бейджи и т. д.),
-- куда пишет /api/admin/content/upload. Бакеты НЕ создаются табличными
-- миграциями автоматически — при переезде на новый Supabase-проект bucket 'content'
-- отсутствовал, так что загрузка падала 500 («Bucket not found»). Эта миграция
-- создаёт bucket идемпотентно, чтобы следующий переезд БД не наступил на те же грабли.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'content', 'content', true, 5242880,
  array['image/png','image/jpeg','image/webp','image/gif']
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Публичное чтение объектов bucket 'content' (картинки видны на лендинге).
-- Запись/обновление/удаление — только service_role (обходит RLS). Отдельных политик
-- для anon/authenticated НЕ добавляем, так что напрямую через API они писать не могут.
drop policy if exists "content_public_read" on storage.objects;
create policy "content_public_read"
  on storage.objects for select
  to public
  using (bucket_id = 'content');
