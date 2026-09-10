// use-cases/admin/manage-custom-fields — кастомні поля ліда (налаштування).
import { ok, fail, type Result } from '../../result'
import { UNIQUE_VIOLATION } from '../../ports/common'
import type { CustomFieldRepository, CustomFieldRow } from '../../ports/leads'
import { planNewCustomField, planCustomFieldPatch } from '../../../domain/lead/custom-fields'

export function makeCustomFieldUseCases(deps: { customFields: CustomFieldRepository }) {
  const { customFields } = deps

  async function listFields(): Promise<Result<CustomFieldRow[]>> {
    const res = await customFields.list()
    if (!res.ok) {
      console.error('[admin/custom-fields] query_failed', res.error)
      return fail('failed', res.error)
    }
    return ok(res.data)
  }

  async function createField(body: Parameters<typeof planNewCustomField>[0]): Promise<Result<CustomFieldRow>> {
    const plan = planNewCustomField(body)
    if (!plan.ok) return fail('invalid', plan.message)
    const nextPosition = (await customFields.maxPosition()) + 1
    const res = await customFields.insert({ ...plan.value, position: nextPosition })
    if (!res.ok) {
      if (res.code === UNIQUE_VIOLATION) return fail('conflict', 'Поле з таким ключем вже існує')
      console.error('[admin/custom-fields] insert_failed', res.error)
      return fail('failed', res.error)
    }
    return ok(res.data)
  }

  async function updateField(id: string, body: Parameters<typeof planCustomFieldPatch>[0]): Promise<Result<CustomFieldRow>> {
    const current = await customFields.get(id)
    if (!current) return fail('not_found', 'Поле не знайдено')
    const plan = planCustomFieldPatch(body, current.type)
    if (!plan.ok) return fail('invalid', plan.message)
    const res = await customFields.update(id, plan.value)
    if (!res.ok) {
      console.error('[admin/custom-fields/[id]] update_failed', res.error)
      return fail('failed', res.error)
    }
    return ok(res.data)
  }

  async function deleteField(id: string): Promise<Result<void>> {
    const res = await customFields.delete(id)
    if (!res.ok) {
      console.error('[admin/custom-fields/[id]] delete_failed', res.error)
      return fail('failed', res.error)
    }
    return ok(undefined)
  }

  return { listFields, createField, updateField, deleteField }
}
