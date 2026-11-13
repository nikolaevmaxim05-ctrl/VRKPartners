-- 024_drop_doctors_reviews.sql
-- C7: таблицы doctors/reviews — донорские (проект «Усмішка»), в VRK Partners не
-- используются (0 строк, нет кода, который их читает/пишет). Миграцию 002 не редактируем,
-- а дропаем здесь. CASCADE убирает связанные политики/индексы/триггеры.
DROP TABLE IF EXISTS public.reviews CASCADE;
DROP TABLE IF EXISTS public.doctors CASCADE;
