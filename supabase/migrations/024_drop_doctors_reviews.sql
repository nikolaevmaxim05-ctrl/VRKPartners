-- 024_drop_doctors_reviews.sql
-- C7: таблиці doctors/reviews — донорські (проєкт «Усмішка»), у VRK Partners не
-- використовуються (0 рядків, немає коду, що читає/пише їх). Міграцію 002 не редагуємо,
-- а дропаємо тут. CASCADE прибирає повʼязані політики/індекси/тригери.
DROP TABLE IF EXISTS public.reviews CASCADE;
DROP TABLE IF EXISTS public.doctors CASCADE;
