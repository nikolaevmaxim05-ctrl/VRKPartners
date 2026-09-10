// core/domain/lead/services — підпис послуги для UI/сповіщень.
// Лендинг VRK пише у leads.service одразу україномовну назву, тож «переклад» тотожний;
// порожнє значення → '—'.
export function getServiceLabel(value: string | null | undefined): string {
  if (!value) return '—'
  return value
}
