#!/usr/bin/env node
// Проверка комментариев в коде (решение владельца 2026-11-13: комментарии — на русском, тексты UI,
// заголовки тестов и сообщения — без изменений). Три режима:
//
//   node scripts/check-comment-lang.mjs list   [--json <файл>] [пути…]
//     Извлекает все комментарии (TS/JS — через TypeScript compiler API, CSS — postcss, SQL — свой
//     токенайзер с учётом строк, идентификаторов и тел $$…$$, .env.example/.gitignore — построчно),
//     печатает сводку по группам каталогов: файлов, комментариев (блоков), строк, язык.
//   node scripts/check-comment-lang.mjs verify <base> [пути…]
//     Доказывает, что относительно коммита <base> в изменённых файлах поменялись только комментарии:
//     TS/JS — поток токенов без trivia (вид + текст, включая JsxText и шаблонные строки); CSS — AST без
//     комментариев; SQL — токены без комментариев плюс литералы `comment on … is '…'` и тела `$$…$$`
//     побайтово; .env.example/.gitignore — некомментарные строки и строки `# NAME=`. Число блоков
//     комментариев до/после должно совпасть. Любое расхождение — код выхода 1.
//   node scripts/check-comment-lang.mjs check  [пути…]
//     Ищет оставшийся украинский в комментариях: буквы і, ї, є, ґ, апостроф внутри слова (обʼєкт) и
//     словарь частых украинских слов без этих букв — вне цитат «…» и бэктиков. Исключения — ALLOWLIST.
//   node scripts/check-comment-lang.mjs verify --titles <base> [пути…]
//     То же для перевода строк тестов: TS-токены побайтово, кроме переводимых строк (заголовки
//     describe/it/test, причины test.skip, сообщения expect — см. collectTestStrings); у них сравнивается
//     только вид токена, у шаблонов — те же подстановки. Комментарии и число строк тестов не меняются.
//   node scripts/check-comment-lang.mjs check --titles [--json <файл>] [пути…]
//     Ищет украинский в строках тестов теми же признаками, что check (цитаты «…» не в счёт).
//   node scripts/check-comment-lang.mjs diff-files [--titles] <старый> <новый> [--as <путь>]
//     Сравнение двух файлов тем же способом, что verify (для самопроверки скрипта).
//
// Комментарий = блок: подряд идущие строки `//`, `--` или `#` (между ними только пробелы) считаются одним
// комментарием; `/* … */` и JSDoc — по одному. Так числа не зависят от переносов внутри блока.
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import postcss from 'postcss'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// ── Какие файлы проверяем ─────────────────────────────────────────────────────────────────────────
const TS_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts'])
function fileType(file) {
  const base = path.basename(file)
  if (base === '.env.example' || base === '.gitignore') return 'hash'
  const ext = path.extname(file)
  if (TS_EXT.has(ext)) return 'ts'
  if (ext === '.css') return 'css'
  if (ext === '.sql') return 'sql'
  if (ext === '.md') return 'doc'
  return null
}

function git(args, opts = {}) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts })
}

function trackedFiles(paths) {
  const out = git(['ls-files', '-z', '--', ...(paths.length ? paths : [])])
  return out
    .split('\0')
    .filter(Boolean)
    .map((f) => f.replace(/\\/g, '/'))
    .filter((f) => !f.startsWith('docs/'))
    .filter((f) => fileType(f) && fileType(f) !== 'doc')
}

function groupOf(file) {
  if (file.startsWith('src/core/')) return 'src/core'
  if (file.startsWith('src/features/')) return 'src/features'
  if (file.startsWith('src/app/')) return 'src/app'
  if (file.startsWith('tests/')) return 'tests'
  if (file.startsWith('src/shared/')) return 'src/shared'
  if (file.startsWith('supabase/migrations/')) return 'supabase/migrations'
  if (file.startsWith('src/infrastructure/')) return 'src/infrastructure'
  if (file === '.env.example' || file === '.gitignore') return '.env.example, .gitignore'
  if (/^src\/(presentation|composition|i18n)\//.test(file) || file === 'src/middleware.ts')
    return 'src/presentation, middleware, composition, i18n'
  if (!file.includes('/') || file.startsWith('scripts/')) return 'конфиги в корне и scripts/'
  return 'прочее'
}

// ── Язык комментария ──────────────────────────────────────────────────────────────────────────────
const CYRILLIC = /[Ѐ-ӿ]/
const UK_LETTERS = /[іїєґ]/i
const RU_LETTERS = /[ыэъё]/i
// Апостроф как разделительный знак внутри слова — только в украинском (обʼєкт, привʼязка, компʼютер).
const UK_APOSTROPHE = /[а-я][ʼ'’`][яюєї]/i
// Частые украинские слова без букв-маркеров (в русском таких слов нет).
const UK_WORDS = new Set(
  `що це цей ця цю цього цьому або лише також якщо щоб немає нема буде будуть може можуть можемо вже
   коли доки як який яка яке якого якому якою яких якими з із зі й чи ще тобто наприклад отже адже бо
   хоча проте але його йому нього кожен кожна кожне кожного кожному кожну жоден жодна жодне жодного
   жодному жодну має мають маємо треба перший перша перше першу першим першого першому окремо окремий
   окрема окреме окремого окрему завжди зараз тепер спочатку спершу насамперед зрештою одне одразу
   раптом негайно майже власне певно мабуть здається загалом радше менше набагато трохи дещо досить
   надто багато серед поряд довкола навколо всюди зовні ззовні зліва праворуч ліворуч помилка помилки
   помилку помилок помилкою запит запиту запити запитом користувач користувача користувачу користувачем
   налаштування налаштувань налаштуванням збережено стає стають робить робимо роблять виконує виконуємо
   виконують викликає викликаємо викликають викликати викликано означає повертає повертаємо повертають
   повертати читає читаємо читають додати додає додаємо додають додано видалити видаляє видаляємо видалено
   вмикає вимикає вимкнено увімкнено увімкнути вимкнути вимкнений увімкнений назва назви назву назвою
   випадок випадку випадках працює працюють працюємо працювати працював запускає запускаємо
   виводить виводимо виведено показує показуємо ховає ховаємо приховано приховує гарантує
   забезпечує дозволяє дозволяємо забороняє заборонено потребує вимагає очікує очікуємо чекає чекаємо
   починає починаємо завершує завершуємо триває тривалість тривалості картка картку картки карток карткою
   посилання посиланням посиланні посилань виклик виклику виклики викликом стовпець стовпця рядок рядка
   рядки рядку рядком тощо зсув зсуву зсунуто обгортка обгортку обгортки обгорткою пляма плями
   плям касання натискання частина частини частину частково решта решти решту
   усе усього усю уся деякий деяка деяке деяких будь-який будь-яка будь-яке будь-що щось хтось колись якось
   довше нещодавно щойно ставимо беремо бере йде йдемо отримує отримуємо отримати отримано знаходить
   знаходимо знайдено рахує рахуємо рахунок обчислює обчислення обчислюємо перераховує перерахунок кладемо
   пропускаємо продовжуємо зупиняємо виходимо використовуємо використати використання застосовуємо
   застосування скидаємо оновлюємо оновлено оновлення створюємо створено створення видалення
   додавання збереження завантаження завантажено надсилаємо отримання очищення очищуємо сортуємо сортування
   групуємо групування розбиваємо розбиття розбивка розгортання згортання перемикаємо перемикач перемикання
   вмикач вимикач прапорець позначка позначено позначаємо зокрема обовʼязково згенеруй згенерувати
   натомість замовчуванням замовчування умовчанням`
    .split(/\s+/)
    .filter(Boolean),
)
// Русские слова, которых нет в украинском (для статистики «уже на русском»).
const RU_WORDS = new Set(
  `и или что если только нет это этот эта эти уже когда где есть быть было будет может нужно иначе например
   здесь каждый любой другой которые который которая которое чтобы потому поэтому затем потом иногда всегда
   никогда ещё еще ли бы из после между`
    .split(/\s+/)
    .filter(Boolean),
)

/**
 * Убирает из текста комментария цитаты «…», бэктики, литералы '…' и URL — они не переводятся.
 * '…' — только когда кавычки стоят не внутри слова (апостроф в «об'єкт» литералом не считается).
 */
function stripQuoted(text) {
  return text
    .replace(/«[^»]*»/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/(^|[^\p{L}])'[^'\n]*'(?=$|[^\p{L}])/gmu, '$1 ')
    .replace(/https?:\/\/\S+/g, ' ')
}

function words(text) {
  return text.toLowerCase().match(/[a-zа-яіїєґʼ'’`-]+/giu) ?? []
}

/** 'uk' | 'ru' | 'mixed' | 'unknown' (кириллица без маркеров) | 'none' */
function detectLanguage(text) {
  const t = stripQuoted(text)
  if (!CYRILLIC.test(t)) return 'none'
  const ws = words(t)
  const uk = UK_LETTERS.test(t) || UK_APOSTROPHE.test(t) || ws.some((w) => UK_WORDS.has(w))
  const ru = RU_LETTERS.test(t) || ws.some((w) => RU_WORDS.has(w))
  if (uk && ru) return 'mixed'
  if (uk) return 'uk'
  if (ru) return 'ru'
  return 'unknown'
}

/** Почему комментарий считается украинским (для check). */
function ukrainianEvidence(text) {
  const t = stripQuoted(text)
  const found = []
  const letters = t.match(/[іїєґ]/gi)
  if (letters) found.push(`буквы ${[...new Set(letters.map((l) => l.toLowerCase()))].join('')}`)
  const apos = t.match(UK_APOSTROPHE)
  if (apos) found.push(`апостроф «${apos[0]}»`)
  const ws = words(t).filter((w) => UK_WORDS.has(w))
  if (ws.length) found.push(`слова: ${[...new Set(ws)].join(', ')}`)
  return found
}

// Поимённые исключения для check: { file, pattern (подстрока текста комментария), reason }.
const ALLOWLIST = [
  { file: 'scripts/check-comment-lang.mjs', pattern: 'Проверка комментариев в коде', reason: 'описание самого check перечисляет украинские буквы-маркеры' },
  { file: 'scripts/check-comment-lang.mjs', pattern: 'Апостроф как разделительный знак', reason: 'примеры украинских слов с апострофом для регулярки' },
]

// ── Общее ─────────────────────────────────────────────────────────────────────────────────────────
function lineIndex(text) {
  const starts = [0]
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1)
  return (pos) => {
    let lo = 0
    let hi = starts.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (starts[mid] <= pos) lo = mid
      else hi = mid - 1
    }
    return lo + 1
  }
}

/**
 * Склеивает подряд идущие однострочные комментарии в блоки.
 * ranges: [{ pos, end, single: boolean }], отсортированы по pos.
 */
function toBlocks(text, ranges) {
  const lineOf = lineIndex(text)
  const blocks = []
  for (const r of ranges) {
    const prev = blocks[blocks.length - 1]
    const raw = text.slice(r.pos, r.end)
    if (prev && prev.single && r.single && /^\s*$/.test(text.slice(prev.end, r.pos)) && lineOf(r.pos) === prev.endLine + 1) {
      prev.end = r.end
      prev.endLine = lineOf(r.end - 1)
      prev.raw += '\n' + raw
      prev.parts += 1
    } else {
      blocks.push({ pos: r.pos, end: r.end, line: lineOf(r.pos), endLine: lineOf(r.end - 1), raw, single: r.single, parts: 1 })
    }
  }
  for (const b of blocks) {
    b.text = commentText(b.raw)
    b.lines = b.endLine - b.line + 1
    b.lang = detectLanguage(b.text)
  }
  return blocks
}

/** Текст комментария без маркеров (//, /*, *, --, #). */
function commentText(raw) {
  return raw
    .split('\n')
    .map((l) =>
      l
        .replace(/^\s*(\/\/|--|#)\s?/, '')
        .replace(/^\s*\/\*+\s?/, '')
        .replace(/\s*\*+\/\s*$/, '')
        .replace(/^\s*\*\s?/, ''),
    )
    .join('\n')
    .trim()
}

// ── TS / JS ───────────────────────────────────────────────────────────────────────────────────────
function tsScriptKind(file) {
  const ext = path.extname(file)
  if (ext === '.tsx') return ts.ScriptKind.TSX
  if (ext === '.jsx') return ts.ScriptKind.JSX
  if (ext === '.js' || ext === '.mjs' || ext === '.cjs') return ts.ScriptKind.JS
  return ts.ScriptKind.TS
}

// ── Заголовки тестов ──────────────────────────────────────────────────────────────────────────────
// Переводимые строки тестов (решение владельца 2026-11-13): заголовки describe/it/test (в т.ч. цепочки
// test.describe, it.todo, it.each(…)(…)), причина пропуска test.skip/fixme/fail/slow(условие, 'причина'),
// сообщение expect(x, 'msg') / expect.soft(x, 'msg') / expect.poll(fn, { message: 'msg' }) и строки-данные
// заголовков в `for (const [name, …] of [['…', …]]) test(name, …)`. Остальное — побайтово.
const TEST_ROOTS = new Set(['describe', 'it', 'test'])
const SKIP_CHAINS = new Set(['test.skip', 'test.fixme', 'test.fail', 'test.slow', 'test.describe.skip', 'test.describe.fixme'])

function calleeChain(expr) {
  const parts = []
  let e = expr
  for (;;) {
    if (ts.isPropertyAccessExpression(e)) {
      parts.unshift(e.name.text)
      e = e.expression
    } else if (ts.isCallExpression(e)) {
      parts.unshift('()')
      e = e.expression
    } else break
  }
  if (!ts.isIdentifier(e)) return null
  parts.unshift(e.text)
  return parts
}

const isTextLiteral = (n) => n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateExpression(n))

/** Текст строки для check: значение литерала; у шаблона — части между подстановками. */
function literalText(n) {
  if (ts.isTemplateExpression(n)) return [n.head.text, ...n.templateSpans.map((s) => s.literal.text)].join(' … ')
  return n.text
}

/** Узлы переводимых строк: [{ node, kind: 'title' | 'skip' | 'expect' | 'data' }]. */
function collectTestStrings(sf) {
  const found = []
  const titleVars = new Map() // имя переменной цикла → true, если она идёт первым аргументом describe/it/test
  const visit = (n) => {
    if (ts.isCallExpression(n)) {
      const chain = calleeChain(n.expression)
      const name = chain?.join('.')
      const [a0, a1] = n.arguments
      if (chain && TEST_ROOTS.has(chain[0])) {
        if (isTextLiteral(a0)) found.push({ node: a0, kind: 'title' })
        else if (SKIP_CHAINS.has(name) && a0 && isTextLiteral(a1)) found.push({ node: a1, kind: 'skip' })
        else if (a0 && ts.isIdentifier(a0)) titleVars.set(a0.text, true)
      }
      if (chain && chain[0] === 'expect' && !chain.includes('()')) {
        if ((name === 'expect' || name === 'expect.soft') && isTextLiteral(a1)) found.push({ node: a1, kind: 'expect' })
        if (name === 'expect.poll' && a1 && ts.isObjectLiteralExpression(a1)) {
          for (const p of a1.properties) {
            if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === 'message' && isTextLiteral(p.initializer)) found.push({ node: p.initializer, kind: 'expect' })
          }
        }
      }
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  // Строки-данные заголовков: for (const [title, …] of [['…', …], …]) / for (const title of ['…', …]).
  const visitFor = (n) => {
    let arr = n.expression
    while (arr && (ts.isAsExpression(arr) || ts.isSatisfiesExpression(arr) || ts.isParenthesizedExpression(arr))) arr = arr.expression
    if (ts.isForOfStatement(n) && ts.isVariableDeclarationList(n.initializer) && ts.isArrayLiteralExpression(arr)) {
      const decl = n.initializer.declarations[0]
      const binding = decl?.name
      if (binding && ts.isIdentifier(binding) && titleVars.has(binding.text)) {
        for (const el of arr.elements) if (isTextLiteral(el)) found.push({ node: el, kind: 'data' })
      } else if (binding && ts.isArrayBindingPattern(binding)) {
        binding.elements.forEach((b, k) => {
          if (!ts.isBindingElement(b) || !ts.isIdentifier(b.name) || !titleVars.has(b.name.text)) return
          for (const row of arr.elements) {
            const el = ts.isArrayLiteralExpression(row) ? row.elements[k] : null
            if (isTextLiteral(el)) found.push({ node: el, kind: 'data' })
          }
        })
      }
    }
    ts.forEachChild(n, visitFor)
  }
  visitFor(sf)
  return found
}

/** Позиции начала листовых токенов, текст которых можно менять (части переводимых строк). */
function maskedStarts(sf, strings) {
  const starts = new Set()
  for (const { node } of strings) {
    if (ts.isTemplateExpression(node)) {
      starts.add(node.head.getStart(sf))
      for (const s of node.templateSpans) starts.add(s.literal.getStart(sf))
    } else starts.add(node.getStart(sf))
  }
  return starts
}

function analyzeTs(text, file, opts = {}) {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, tsScriptKind(file))
  const testStrings = opts.titles ? collectTestStrings(sf) : []
  const masked = opts.titles ? maskedStarts(sf, testStrings) : new Set()
  const tokens = []
  const byPos = new Map()
  const isJsDoc = (n) => n.kind >= ts.SyntaxKind.FirstJSDocNode && n.kind <= ts.SyntaxKind.LastJSDocNode
  const addComments = (pos) => {
    for (const r of ts.getLeadingCommentRanges(text, pos) ?? []) {
      if (!byPos.has(r.pos)) byPos.set(r.pos, { pos: r.pos, end: r.end, single: r.kind === ts.SyntaxKind.SingleLineCommentTrivia })
    }
  }
  const visit = (node) => {
    if (isJsDoc(node)) return
    const children = node.getChildren(sf)
    if (children.length === 0) {
      if (node.kind !== ts.SyntaxKind.JsxText) addComments(node.pos)
      if (node.kind < ts.SyntaxKind.FirstNode) {
        const start = node.kind === ts.SyntaxKind.JsxText ? node.pos : node.getStart(sf)
        // Переводимая строка теста: сравнивается только вид токена (строка остаётся строкой, у шаблона — те же подстановки).
        tokens.push({ kind: node.kind, text: masked.has(start) ? '<строка теста>' : text.slice(start, node.end) })
      }
      return
    }
    for (const c of children) visit(c)
  }
  visit(sf)
  const ranges = [...byPos.values()].sort((a, b) => a.pos - b.pos)
  const lineOf = lineIndex(text)
  const strings = testStrings.map(({ node, kind }) => ({ kind, line: lineOf(node.getStart(sf)), text: literalText(node), source: node.getText(sf) }))
  return { tokens, blocks: toBlocks(text, ranges), ranges: ranges.length, diagnostics: sf.parseDiagnostics.length, protectedItems: [], strings }
}

// ── CSS ───────────────────────────────────────────────────────────────────────────────────────────
function analyzeCss(text) {
  const root = postcss.parse(text)
  const lineOf = lineIndex(text)
  const ranges = []
  const nodes = []
  root.walk((n) => {
    if (n.type === 'comment') {
      const pos = n.source.start.offset
      const end = n.source.end.offset + 1
      ranges.push({ pos, end, single: false })
      return
    }
    if (n.type === 'rule') nodes.push(['rule', n.selector])
    else if (n.type === 'decl') nodes.push(['decl', n.prop, n.value, Boolean(n.important), n.raws.important ?? ''])
    else if (n.type === 'atrule') nodes.push(['atrule', n.name, n.params])
    else nodes.push([n.type])
    // Комментарии внутри значения/селектора postcss вырезает в raws — учитываем их как комментарии.
    for (const raw of [n.raws?.value?.raw, n.raws?.selector?.raw, n.raws?.params?.raw]) {
      if (typeof raw === 'string' && raw.includes('/*')) {
        const base = n.source.start.offset
        const re = /\/\*[\s\S]*?\*\//g
        let m
        while ((m = re.exec(raw))) ranges.push({ pos: base + m.index, end: base + m.index + m[0].length, single: false })
      }
    }
  })
  ranges.sort((a, b) => a.pos - b.pos)
  void lineOf
  return { tokens: nodes.map((n) => ({ kind: n[0], text: JSON.stringify(n) })), blocks: toBlocks(text, ranges), ranges: ranges.length, diagnostics: 0, protectedItems: [] }
}

// ── SQL ───────────────────────────────────────────────────────────────────────────────────────────
function analyzeSql(text) {
  const n = text.length
  const tokens = []
  const ranges = []
  const dollarBodies = []
  let i = 0
  const isIdent = (c) => /[A-Za-z0-9_]/.test(c)
  while (i < n) {
    const c = text[i]
    if (/\s/.test(c)) {
      i++
      continue
    }
    if (c === '-' && text[i + 1] === '-') {
      let j = text.indexOf('\n', i)
      if (j === -1) j = n
      ranges.push({ pos: i, end: j, single: true })
      i = j
      continue
    }
    if (c === '/' && text[i + 1] === '*') {
      let depth = 1
      let j = i + 2
      while (j < n && depth > 0) {
        if (text[j] === '/' && text[j + 1] === '*') (depth++, (j += 2))
        else if (text[j] === '*' && text[j + 1] === '/') (depth--, (j += 2))
        else j++
      }
      ranges.push({ pos: i, end: j, single: false })
      i = j
      continue
    }
    if (c === "'" || ((c === 'e' || c === 'E') && text[i + 1] === "'" && (i === 0 || !isIdent(text[i - 1])))) {
      const escaped = c !== "'"
      let j = escaped ? i + 2 : i + 1
      while (j < n) {
        if (escaped && text[j] === '\\') {
          j += 2
          continue
        }
        if (text[j] === "'") {
          if (text[j + 1] === "'") {
            j += 2
            continue
          }
          j++
          break
        }
        j++
      }
      tokens.push({ kind: 'string', text: text.slice(i, j) })
      i = j
      continue
    }
    if (c === '"') {
      let j = i + 1
      while (j < n) {
        if (text[j] === '"') {
          if (text[j + 1] === '"') {
            j += 2
            continue
          }
          j++
          break
        }
        j++
      }
      tokens.push({ kind: 'ident', text: text.slice(i, j) })
      i = j
      continue
    }
    if (c === '$') {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(text.slice(i, i + 64))
      if (m) {
        const tag = m[0]
        const close = text.indexOf(tag, i + tag.length)
        const j = close === -1 ? n : close + tag.length
        const body = text.slice(i, j)
        tokens.push({ kind: 'dollar', text: body })
        dollarBodies.push(body)
        i = j
        continue
      }
    }
    if (/[A-Za-z0-9_$.]/.test(c)) {
      let j = i + 1
      while (j < n && /[A-Za-z0-9_$.]/.test(text[j])) j++
      tokens.push({ kind: 'word', text: text.slice(i, j).toLowerCase() === text.slice(i, j) ? text.slice(i, j) : text.slice(i, j) })
      i = j
      continue
    }
    tokens.push({ kind: 'punct', text: c })
    i++
  }
  // Литералы `comment on … is '…'`.
  const commentOnLiterals = []
  for (let k = 0; k < tokens.length; k++) {
    if (tokens[k].kind === 'word' && tokens[k].text.toLowerCase() === 'comment' && tokens[k + 1]?.text.toLowerCase() === 'on') {
      for (let m = k + 2; m < Math.min(k + 12, tokens.length); m++) {
        if (tokens[m].kind === 'word' && tokens[m].text.toLowerCase() === 'is' && tokens[m + 1]?.kind === 'string') {
          commentOnLiterals.push(tokens[m + 1].text)
          break
        }
      }
    }
  }
  const protectedItems = [...commentOnLiterals.map((t) => ['comment on', t]), ...dollarBodies.map((t) => ['$$', t])]
  return { tokens, blocks: toBlocks(text, ranges), ranges: ranges.length, diagnostics: 0, protectedItems }
}

// ── .env.example / .gitignore ─────────────────────────────────────────────────────────────────────
const PROTECTED_HASH = /^#\s*[A-Z][A-Z0-9_]*=/
function analyzeHash(text) {
  const lines = text.split('\n')
  const tokens = []
  const ranges = []
  let pos = 0
  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, '')
    const trimmed = line.trim()
    if (trimmed.startsWith('#')) {
      // `# NAME=value` защищается целиком; `# NAME=value — пояснение` — защищён префикс, проза после тире — комментарий.
      const m = PROTECTED_HASH.test(trimmed) ? trimmed.match(/^(#\s*[A-Z][A-Z0-9_]*=\S*)(\s+[—–-]\s+.*)?$/) : null
      if (m) {
        tokens.push({ kind: 'protected', text: m[1] })
        if (m[2]) {
          const start = pos + line.indexOf(trimmed) + m[1].length
          ranges.push({ pos: start, end: pos + line.indexOf(trimmed) + trimmed.length, single: true })
        }
      } else if (PROTECTED_HASH.test(trimmed)) tokens.push({ kind: 'protected', text: trimmed })
      else ranges.push({ pos, end: pos + line.length, single: true })
    } else if (trimmed) {
      tokens.push({ kind: 'line', text: trimmed })
    }
    pos += rawLine.length + 1
  }
  return { tokens, blocks: toBlocks(text, ranges), ranges: ranges.length, diagnostics: 0, protectedItems: [] }
}

function analyze(text, file, type = fileType(file), opts = {}) {
  if (type === 'ts') return analyzeTs(text, file, opts)
  if (type === 'css') return analyzeCss(text)
  if (type === 'sql') return analyzeSql(text)
  if (type === 'hash') return analyzeHash(text)
  throw new Error(`Неизвестный тип файла: ${file}`)
}

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8')
}

// ── list ──────────────────────────────────────────────────────────────────────────────────────────
function cmdList(args) {
  const jsonIdx = args.indexOf('--json')
  let jsonOut = null
  if (jsonIdx !== -1) {
    jsonOut = args[jsonIdx + 1]
    args.splice(jsonIdx, 2)
  }
  const files = trackedFiles(args)
  const all = []
  const groups = new Map()
  for (const file of files) {
    const a = analyze(read(file), file)
    const cyr = a.blocks.filter((b) => b.lang !== 'none')
    for (const b of a.blocks) all.push({ file, line: b.line, endLine: b.endLine, lines: b.lines, lang: b.lang, text: b.text })
    const g = groupOf(file)
    const acc = groups.get(g) ?? { files: 0, comments: 0, lines: 0, uk: 0, ru: 0, mixed: 0, unknown: 0, total: 0 }
    acc.total += a.blocks.length
    if (cyr.length) {
      acc.files += 1
      acc.comments += cyr.length
      acc.lines += cyr.reduce((s, b) => s + b.lines, 0)
      for (const b of cyr) acc[b.lang] += 1
    }
    groups.set(g, acc)
  }
  const rows = [...groups.entries()].sort((x, y) => y[1].comments - x[1].comments)
  const pad = (s, w) => String(s).padEnd(w)
  const num = (s, w) => String(s).padStart(w)
  console.log(`${pad('Группа', 46)} ${num('Файлов', 6)} ${num('Комм.', 6)} ${num('Строк', 6)} ${num('uk', 5)} ${num('ru', 5)} ${num('mix', 4)} ${num('?', 5)} ${num('всего', 6)}`)
  const sum = { files: 0, comments: 0, lines: 0, uk: 0, ru: 0, mixed: 0, unknown: 0, total: 0 }
  for (const [g, a] of rows) {
    console.log(`${pad(g, 46)} ${num(a.files, 6)} ${num(a.comments, 6)} ${num(a.lines, 6)} ${num(a.uk, 5)} ${num(a.ru, 5)} ${num(a.mixed, 4)} ${num(a.unknown, 5)} ${num(a.total, 6)}`)
    for (const k of Object.keys(sum)) sum[k] += a[k]
  }
  console.log(`${pad('Итого (с кириллицей)', 46)} ${num(sum.files, 6)} ${num(sum.comments, 6)} ${num(sum.lines, 6)} ${num(sum.uk, 5)} ${num(sum.ru, 5)} ${num(sum.mixed, 4)} ${num(sum.unknown, 5)} ${num(sum.total, 6)}`)
  console.log(`Файлов проверено: ${files.length}; «?» — кириллица без букв-маркеров (язык определяется чтением).`)
  if (jsonOut) {
    fs.writeFileSync(jsonOut, JSON.stringify(all, null, 1))
    console.log(`JSON: ${jsonOut} (${all.length} комментариев)`)
  }
}

// ── verify ────────────────────────────────────────────────────────────────────────────────────────
function compareAnalyses(before, after, label, opts = {}) {
  const problems = []
  if (opts.titles) {
    // Режим заголовков тестов: комментарии не трогаются вовсе, число переводимых строк то же.
    if (before.blocks.length !== after.blocks.length || before.blocks.some((b, i) => b.raw !== after.blocks[i].raw)) problems.push('изменились комментарии')
    if ((before.strings?.length ?? 0) !== (after.strings?.length ?? 0)) problems.push(`число строк тестов: ${before.strings?.length ?? 0} → ${after.strings?.length ?? 0}`)
  }
  if (before.tokens.length !== after.tokens.length || before.tokens.some((t, i) => t.kind !== after.tokens[i].kind || t.text !== after.tokens[i].text)) {
    let i = 0
    while (i < before.tokens.length && i < after.tokens.length && before.tokens[i].kind === after.tokens[i].kind && before.tokens[i].text === after.tokens[i].text) i++
    const show = (t) => (t ? `${typeof t.kind === 'number' ? ts.SyntaxKind[t.kind] : t.kind} ${JSON.stringify(t.text).slice(0, 80)}` : '<конец>')
    problems.push(`токены расходятся с №${i}: было ${show(before.tokens[i])}, стало ${show(after.tokens[i])}`)
  }
  if (before.diagnostics !== after.diagnostics) problems.push(`синтаксические ошибки: ${before.diagnostics} → ${after.diagnostics}`)
  if (before.protectedItems.length !== after.protectedItems.length || before.protectedItems.some((p, i) => p[0] !== after.protectedItems[i][0] || p[1] !== after.protectedItems[i][1])) {
    problems.push('изменились защищённые литералы (comment on / тела $$)')
  }
  if (before.blocks.length !== after.blocks.length) problems.push(`число комментариев: ${before.blocks.length} → ${after.blocks.length}`)
  return problems
}

// При core.autocrlf=true (так на машине владельца) рабочая копия бывает с CRLF, а git хранит LF и сам
// нормализует при коммите. Сравниваем так же, как git: CRLF → LF с обеих сторон.
const normalizeEol = (s) => s.replace(/\r\n/g, '\n')

function verifyPair(oldText, newText, file, opts = {}) {
  oldText = normalizeEol(oldText)
  newText = normalizeEol(newText)
  const type = fileType(file)
  const before = analyze(oldText, file, type, opts)
  const after = analyze(newText, file, type, opts)
  const problems = compareAnalyses(before, after, file, opts)
  const oldLines = oldText.split('\n').length
  const newLines = newText.split('\n').length
  return { problems, before, after, lineDelta: newLines - oldLines }
}

function cmdVerify(args) {
  const opts = takeFlag(args, '--titles') ? { titles: true } : {}
  const base = args[0]
  if (!base) throw new Error('verify: укажите базовый коммит')
  const paths = args.slice(1)
  const changed = git(['diff', '--name-only', '-z', base, '--', ...paths])
    .split('\0')
    .filter(Boolean)
    .map((f) => f.replace(/\\/g, '/'))
  let failed = 0
  let commentsBefore = 0
  let commentsAfter = 0
  let linesDelta = 0
  let stringsChanged = 0
  const skipped = []
  for (const file of changed) {
    const type = fileType(file)
    if (type === 'doc') {
      skipped.push(file)
      continue
    }
    if (!type) {
      console.log(`✖ ${file}: изменён файл, который скрипт не умеет проверять`)
      failed++
      continue
    }
    const exists = fs.existsSync(path.join(ROOT, file))
    let oldText
    try {
      oldText = git(['show', `${base}:${file}`])
    } catch {
      console.log(`• ${file}: новый файл (в ${base} нет) — пропущен`)
      continue
    }
    if (!exists) {
      console.log(`✖ ${file}: удалён`)
      failed++
      continue
    }
    const r = verifyPair(oldText, read(file), file, opts)
    if (opts.titles) {
      const changedStrings = (r.before.strings ?? []).filter((x, i) => x.source !== r.after.strings[i]?.source).length
      stringsChanged += changedStrings
      if (r.problems.length) {
        failed++
        console.log(`✖ ${file}: ${r.problems.join('; ')}`)
      } else console.log(`✔ ${file}: строк тестов ${(r.before.strings ?? []).length}, изменено ${changedStrings}${r.lineDelta ? `, строк файла ${r.lineDelta > 0 ? '+' : ''}${r.lineDelta}` : ''}`)
      continue
    }
    commentsBefore += r.before.blocks.length
    commentsAfter += r.after.blocks.length
    linesDelta += r.lineDelta
    const delta = r.lineDelta === 0 ? '' : ` строк ${r.lineDelta > 0 ? '+' : ''}${r.lineDelta}`
    if (r.problems.length) {
      failed++
      console.log(`✖ ${file}: ${r.problems.join('; ')}`)
    } else {
      console.log(`✔ ${file}: комментариев ${r.before.blocks.length} → ${r.after.blocks.length}${delta}`)
    }
  }
  if (skipped.length) console.log(`Документы (не проверяются): ${skipped.join(', ')}`)
  if (opts.titles) {
    console.log(`verify --titles: файлов ${changed.length - skipped.length}, изменено строк тестов ${stringsChanged}, расхождений ${failed}`)
    process.exitCode = failed ? 1 : 0
    return
  }
  console.log(`verify: файлов ${changed.length - skipped.length}, комментариев ${commentsBefore} → ${commentsAfter}, строк ${linesDelta >= 0 ? '+' : ''}${linesDelta}, расхождений ${failed}`)
  process.exitCode = failed ? 1 : 0
}

function cmdDiffFiles(args) {
  const opts = takeFlag(args, '--titles') ? { titles: true } : {}
  const asIdx = args.indexOf('--as')
  const as = asIdx !== -1 ? args[asIdx + 1] : args[1]
  const oldText = fs.readFileSync(args[0], 'utf8')
  const newText = fs.readFileSync(args[1], 'utf8')
  const r = verifyPair(oldText, newText, as, opts)
  if (r.problems.length) {
    console.log(`✖ ${as}: ${r.problems.join('; ')}`)
    process.exitCode = 1
  } else {
    console.log(`✔ ${as}: комментариев ${r.before.blocks.length} → ${r.after.blocks.length}, строк ${r.lineDelta >= 0 ? '+' : ''}${r.lineDelta}`)
  }
}

/** Убирает флаг из args; true, если он был. */
function takeFlag(args, flag) {
  const i = args.indexOf(flag)
  if (i === -1) return false
  args.splice(i, 1)
  return true
}

// ── check ─────────────────────────────────────────────────────────────────────────────────────────
function cmdCheck(args) {
  if (takeFlag(args, '--titles')) return cmdCheckTitles(args)
  const files = trackedFiles(args)
  let found = 0
  let allowed = 0
  for (const file of files) {
    const a = analyze(read(file), file)
    for (const b of a.blocks) {
      const evidence = ukrainianEvidence(b.text)
      if (!evidence.length) continue
      const allow = ALLOWLIST.find((e) => e.file === file && b.text.includes(e.pattern))
      if (allow) {
        allowed++
        continue
      }
      found++
      const preview = b.text.replace(/\s+/g, ' ').slice(0, 100)
      console.log(`${file}:${b.line}: ${evidence.join('; ')}\n    ${preview}`)
    }
  }
  console.log(`check: украинских комментариев ${found}${allowed ? `, в allowlist ${allowed}` : ''} (файлов ${files.length})`)
  process.exitCode = found ? 1 : 0
}

// Поимённые исключения для check --titles: { file, pattern (подстрока строки теста), reason }.
const TITLE_ALLOWLIST = []

const TEST_FILE = /(^|\/)(__tests__\/|tests\/e2e\/)|\.(test|spec)\.[cm]?[tj]sx?$/
const KIND_LABEL = { title: 'заголовок', skip: 'причина пропуска', expect: 'сообщение expect', data: 'данные заголовка' }

/** check --titles [--json f] [пути…]: украинский в заголовках тестов, причинах пропуска и сообщениях expect. */
function cmdCheckTitles(args) {
  const jsonIdx = args.indexOf('--json')
  let jsonOut = null
  if (jsonIdx !== -1) {
    jsonOut = args[jsonIdx + 1]
    args.splice(jsonIdx, 2)
  }
  const files = trackedFiles(args).filter((f) => fileType(f) === 'ts' && TEST_FILE.test(f))
  const all = []
  const counts = { title: 0, skip: 0, expect: 0, data: 0 }
  let found = 0
  let allowed = 0
  for (const file of files) {
    const a = analyze(normalizeEol(read(file)), file, 'ts', { titles: true })
    for (const s of a.strings) {
      counts[s.kind]++
      const evidence = ukrainianEvidence(s.text)
      all.push({ file, ...s, uk: evidence.length > 0 })
      if (!evidence.length) continue
      if (TITLE_ALLOWLIST.find((e) => e.file === file && s.text.includes(e.pattern))) {
        allowed++
        continue
      }
      found++
      console.log(`${file}:${s.line}: ${KIND_LABEL[s.kind]}; ${evidence.join('; ')}\n    ${s.text.replace(/\s+/g, ' ').slice(0, 110)}`)
    }
  }
  if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(all, null, 1))
  console.log(`check --titles: украинских строк ${found}${allowed ? `, в allowlist ${allowed}` : ''} (файлов ${files.length}; заголовков ${counts.title}, причин пропуска ${counts.skip}, сообщений expect ${counts.expect}, данных заголовков ${counts.data})`)
  process.exitCode = found ? 1 : 0
}

// ── main ──────────────────────────────────────────────────────────────────────────────────────────
const [mode, ...rest] = process.argv.slice(2)
try {
  if (mode === 'list') cmdList(rest)
  else if (mode === 'verify') cmdVerify(rest)
  else if (mode === 'check') cmdCheck(rest)
  else if (mode === 'diff-files') cmdDiffFiles(rest)
  else {
    console.log('Использование: check-comment-lang.mjs list [--json f] [пути] | verify [--titles] <base> [пути] | check [пути] | check --titles [--json f] [пути] | diff-files [--titles] <a> <b> [--as путь]')
    process.exitCode = 2
  }
} catch (err) {
  console.error(err)
  process.exitCode = 2
}
