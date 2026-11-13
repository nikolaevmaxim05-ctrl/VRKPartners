// Нормализация телефона до E.164 (+380XXXXXXXXX). Чистый модуль без серверных
// зависимостей — используется и на клиенте (Zod-схема формы), и на сервере
// (дедуп, вставка лида). Так гарантируем, что в БД и в сравнении дедупа — один формат.
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 0) return ''
  if (digits.startsWith('380')) return `+${digits}`
  if (digits.startsWith('0') && digits.length === 10) return `+38${digits}`
  if (digits.length === 9) return `+380${digits}`
  // другой формат — возвращаем как есть (с +)
  return `+${digits}`
}
