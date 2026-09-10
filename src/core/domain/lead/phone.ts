// Нормалізація телефону до E.164 (+380XXXXXXXXX). Чистий модуль без серверних
// залежностей — використовується і на клієнті (Zod-схема форми), і на сервері
// (дедуп, вставка ліда). Так гарантуємо, що в БД і в порівнянні дедупу — один формат.
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 0) return ''
  if (digits.startsWith('380')) return `+${digits}`
  if (digits.startsWith('0') && digits.length === 10) return `+38${digits}`
  if (digits.length === 9) return `+380${digits}`
  // інший формат — повертаємо як є (з +)
  return `+${digits}`
}
