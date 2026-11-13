"use client";

import { useEffect } from "react";
import {
  UTM_STORAGE_KEY,
  UTM_URL_KEYS,
  normalizeUtm,
  type UtmData,
} from "@/features/landing/lib/utm";
import { captureRefFromUrl } from "@/features/landing/lib/referral";

// Невидимый компонент: на маунте считывает UTM-метки из URL и складывает их в sessionStorage.
// Логика last-touch: новые метки из URL перезаписывают сохранённые (только те ключи, что есть в URL).
// referrer фиксируется один раз — на первом визите в сессии.
export function UtmTracker() {
  useEffect(() => {
    // Реферальный код из ?ref= — зеркало HttpOnly-cookie (отклонение 11).
    captureRefFromUrl();
    try {
      const params = new URLSearchParams(window.location.search);

      // 1. Собираем UTM-метки из URL
      const fromUrl: UtmData = {};
      for (const key of UTM_URL_KEYS) {
        const value = params.get(key);
        if (value && value.trim().length > 0) {
          fromUrl[key] = value.trim();
        }
      }
      const hasUrlMarks = Object.keys(fromUrl).length > 0;

      // 2. Читаем то, что уже сохранено
      const storedRaw = window.sessionStorage.getItem(UTM_STORAGE_KEY);
      const stored: UtmData = storedRaw ? normalizeUtm(safeJsonParse(storedRaw)) : {};
      const isFirstVisit = !storedRaw;

      // 3. Первый визит в сессии — фиксируем внешний referrer
      if (isFirstVisit) {
        const ref = document.referrer;
        if (ref && !ref.startsWith(window.location.origin)) {
          stored.referrer = ref;
        }
      }

      // 4. Если в URL нет новых меток:
      //    - первый визит с внешним referrer → сохраняем только его
      //    - иначе ничего не трогаем (сохранённое остаётся)
      if (!hasUrlMarks) {
        if (isFirstVisit && stored.referrer) {
          window.sessionStorage.setItem(UTM_STORAGE_KEY, JSON.stringify(stored));
        }
        return;
      }

      // 5. Есть новые метки — мержим (новые перезаписывают старые) и сохраняем
      const merged: UtmData = { ...stored, ...fromUrl };
      window.sessionStorage.setItem(UTM_STORAGE_KEY, JSON.stringify(merged));
    } catch {
      // sessionStorage недоступен (приватный режим / выключен) — просто игнорируем
    }
  }, []);

  return null;
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
