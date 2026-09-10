"use client";

import { useEffect } from "react";
import {
  UTM_STORAGE_KEY,
  UTM_URL_KEYS,
  normalizeUtm,
  type UtmData,
} from "@/features/landing/lib/utm";

// Невидимий компонент: на маунті зчитує UTM-мітки з URL і складає їх у sessionStorage.
// Логіка last-touch: нові мітки з URL перезаписують збережені (тільки ті ключі, що є в URL).
// referrer фіксується один раз — на першому візиті в сесії.
export function UtmTracker() {
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);

      // 1. Збираємо UTM-мітки з URL
      const fromUrl: UtmData = {};
      for (const key of UTM_URL_KEYS) {
        const value = params.get(key);
        if (value && value.trim().length > 0) {
          fromUrl[key] = value.trim();
        }
      }
      const hasUrlMarks = Object.keys(fromUrl).length > 0;

      // 2. Читаємо те, що вже збережено
      const storedRaw = window.sessionStorage.getItem(UTM_STORAGE_KEY);
      const stored: UtmData = storedRaw ? normalizeUtm(safeJsonParse(storedRaw)) : {};
      const isFirstVisit = !storedRaw;

      // 3. Перший візит у сесії — фіксуємо зовнішній referrer
      if (isFirstVisit) {
        const ref = document.referrer;
        if (ref && !ref.startsWith(window.location.origin)) {
          stored.referrer = ref;
        }
      }

      // 4. Якщо в URL немає нових міток:
      //    - перший візит із зовнішнім referrer → зберігаємо лише його
      //    - інакше нічого не чіпаємо (збережене лишається)
      if (!hasUrlMarks) {
        if (isFirstVisit && stored.referrer) {
          window.sessionStorage.setItem(UTM_STORAGE_KEY, JSON.stringify(stored));
        }
        return;
      }

      // 5. Є нові мітки — мерджимо (нові перезаписують старі) і зберігаємо
      const merged: UtmData = { ...stored, ...fromUrl };
      window.sessionStorage.setItem(UTM_STORAGE_KEY, JSON.stringify(merged));
    } catch {
      // sessionStorage недоступний (приватний режим / вимкнено) — просто ігноруємо
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
