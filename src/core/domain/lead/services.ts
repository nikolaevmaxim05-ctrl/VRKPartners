// core/domain/lead/services — подпись услуги для UI/уведомлений.
// Лендинг VRK пишет в leads.service сразу украиноязычное название, так что «перевод» тождественный;
// пустое значение → '—'.
export function getServiceLabel(value: string | null | undefined): string {
  if (!value) return '—'
  return value
}
