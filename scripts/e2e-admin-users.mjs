// Фікстури для e2e адмінки: створює (або видаляє) тестових користувачів у Supabase Auth БЕЗ листів
// (auth.admin.createUser з email_confirm) і призначає ролі в user_roles. Запускати ЛИШЕ з відома
// власника — це прод-проєкт. Ключі читаються з .env.local.
//
//   node scripts/e2e-admin-users.mjs create   — тестовий адмін (E2E_ADMIN_EMAIL/PASSWORD, роль з повними
//                                               правами; за замовчуванням не-системна роль із усіма правами
//                                               або E2E_ADMIN_ROLE) і користувач мінімальної ролі
//                                               (E2E_ADMIN2_EMAIL/PASSWORD, роль «e2e-minimal» з manage_leads)
//   node scripts/e2e-admin-users.mjs cleanup  — видаляє обох користувачів, їх user_roles і роль «e2e-minimal»
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

function loadEnv() {
  try {
    for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2]
    }
  } catch {
    /* немає .env.local — беремо process.env */
  }
}
loadEnv()

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const service = process.env.SUPABASE_SERVICE_ROLE_KEY
const admin = { email: process.env.E2E_ADMIN_EMAIL, password: process.env.E2E_ADMIN_PASSWORD, role: process.env.E2E_ADMIN_ROLE }
const minimal = { email: process.env.E2E_ADMIN2_EMAIL, password: process.env.E2E_ADMIN2_PASSWORD }
const MINIMAL_ROLE = 'e2e-minimal'
const ALL_PERMISSIONS = ['manage_leads', 'manage_users', 'manage_settings', 'view_reports', 'manage_roles', 'export_data', 'delete_leads', 'manage_integrations', 'manage_content', 'manage_conversions', 'manage_referrals']

if (!url || !service) {
  console.error('Потрібні NEXT_PUBLIC_SUPABASE_URL і SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
const db = createClient(url, service, { auth: { persistSession: false } })

async function findUser(email) {
  const { data, error } = await db.auth.admin.listUsers({ perPage: 1000 })
  if (error) throw error
  return data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase()) ?? null
}

async function ensureUser({ email, password }, roleId, name) {
  let user = await findUser(email)
  if (!user) {
    const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true })
    if (error) throw error
    user = data.user
    console.log(`created auth user ${email} (${user.id})`)
  } else {
    const { error } = await db.auth.admin.updateUserById(user.id, { password })
    if (error) throw error
    console.log(`auth user exists ${email} (${user.id}), password updated`)
  }
  const { error } = await db.from('user_roles').upsert({ user_id: user.id, role_id: roleId, name, is_active: true }, { onConflict: 'user_id' })
  if (error) throw error
  console.log(`role assigned: ${email} → ${roleId}`)
}

async function create() {
  if (!admin.email || !admin.password) throw new Error('E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD не задані')
  const { data: roles, error } = await db.from('admin_roles').select('id, name, is_system, permissions, hierarchy_order').order('hierarchy_order')
  if (error) throw error
  let full = admin.role ? roles.find((r) => r.name === admin.role) : roles.find((r) => !r.is_system && ALL_PERMISSIONS.every((p) => r.permissions.includes(p)))
  if (!full) {
    // Рівень 0 — одразу під системним admin (-1), вище за всі клієнтські ролі: тестовий адмін має
    // право запрошувати/редагувати користувачів з ролями нижче за свою (перевіряється в e2e).
    const ins = await db.from('admin_roles').insert({ name: 'e2e-full', permissions: ALL_PERMISSIONS, is_system: false, hierarchy_order: 0 }).select('id, name').single()
    if (ins.error) throw ins.error
    full = ins.data
    console.log(`created role e2e-full (${full.id})`)
  }
  await ensureUser(admin, full.id, 'E2E адмін')

  if (minimal.email && minimal.password) {
    let min = roles.find((r) => r.name === MINIMAL_ROLE)
    if (!min) {
      const maxOrder = Math.max(0, ...roles.map((r) => Number(r.hierarchy_order ?? 0)))
      const ins = await db.from('admin_roles').insert({ name: MINIMAL_ROLE, permissions: ['manage_leads'], is_system: false, hierarchy_order: maxOrder + 2 }).select('id, name').single()
      if (ins.error) throw ins.error
      min = ins.data
      console.log(`created role ${MINIMAL_ROLE} (${min.id})`)
    }
    await ensureUser(minimal, min.id, 'E2E мінімальний')
  }
}

async function cleanup() {
  for (const u of [admin, minimal]) {
    if (!u.email) continue
    const user = await findUser(u.email)
    if (!user) continue
    await db.from('audit_log').delete().eq('user_id', user.id)
    await db.from('user_roles').delete().eq('user_id', user.id)
    const { error } = await db.auth.admin.deleteUser(user.id)
    if (error) throw error
    console.log(`deleted ${u.email}`)
  }
  for (const name of [MINIMAL_ROLE, 'e2e-full']) {
    const { error } = await db.from('admin_roles').delete().eq('name', name)
    if (error) console.warn(`role ${name}: ${error.message}`)
  }
}

const cmd = process.argv[2]
if (cmd === 'create') create().catch((e) => { console.error(e); process.exit(1) })
else if (cmd === 'cleanup') cleanup().catch((e) => { console.error(e); process.exit(1) })
else {
  console.error('usage: node scripts/e2e-admin-users.mjs create|cleanup')
  process.exit(1)
}
