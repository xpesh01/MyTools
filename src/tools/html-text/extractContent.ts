/**
 * Выжимка текста из HTML: убирает обвязку страницы и собирает Markdown —
 * заголовки, списки и таблицы сохраняют структуру, по которой нейросеть
 * понимает смысл, а скрипты, иконки и меню выбрасываются.
 */

/** Константы вместо Node.TEXT_NODE: так модуль не зависит от глобалей браузера. */
const ELEMENT_NODE = 1
const TEXT_NODE = 3

/** Теги, в которых текста либо нет, либо он служебный. */
const JUNK_TAGS =
  'script, style, noscript, template, svg, math, canvas, iframe, object, embed, video, audio, source, track, link, meta, base, input, select, textarea, button, dialog, nav, [hidden], [aria-hidden="true"], [role="navigation"], [role="banner"], [role="contentinfo"], [role="complementary"], [role="search"], [role="dialog"], [role="alert"]'

/** Обвязка почти всегда подписана в class или id одним из этих слов. */
const JUNK_NAMES =
  /(^|[-_ ])(nav|navbar|navigation|menu|sidebar|footer|header|masthead|banner|cookies?|consent|gdpr|popup|modal|overlay|advert|ads?|promo|subscribe|newsletter|share|social|breadcrumbs?|pagination|pager|related|recommended|comments?|widget|toolbar|skip|offscreen|sr-only|visually-hidden)([-_ ]|$)/i

/** Эти блоки вырезать нельзя: в них и лежит содержимое. */
const KEEP_TAGS = new Set(['body', 'main', 'article'])

/** Длинный текст с малым числом ссылок — содержимое, даже если class называется «related». */
const RICH_TEXT = 400

const HEADINGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])

/** Теги, которые не разрывают абзац. */
const INLINE = new Set([
  'a', 'abbr', 'b', 'bdi', 'bdo', 'big', 'cite', 'code', 'data', 'del', 'dfn', 'em', 'font', 'i',
  'ins', 'kbd', 'label', 'mark', 'q', 'rb', 'rt', 'ruby', 's', 'samp', 'small', 'span', 'strong',
  'sub', 'sup', 'time', 'tt', 'u', 'var', 'wbr',
])

export interface ExtractOptions {
  /** Взять всю страницу, а не только найденный основной блок */
  whole?: boolean
}

export interface PageText {
  title: string | null
  markdown: string
  stats: {
    sourceChars: number
    chars: number
    words: number
    /** Грубая оценка: точное число зависит от токенизатора конкретной модели */
    tokens: number
    headings: number
    tables: number
  }
}

export function extractContent(html: string, options: ExtractOptions = {}): PageText {
  // Разбор в отдельном документе: скрипты не выполняются, картинки не загружаются
  const page = new DOMParser().parseFromString(html, 'text/html')
  const title = pageTitle(page)

  clean(page)

  const root = options.whole ? page.body : pickMain(page)
  const blocks = root ? blocksOf(root) : []
  const markdown = withTitle(title, join(blocks))

  return {
    title,
    markdown,
    stats: {
      sourceChars: html.length,
      chars: markdown.length,
      words: markdown.split(/\s+/).filter(Boolean).length,
      tokens: estimateTokens(markdown),
      headings: (markdown.match(/^#{1,6} /gm) ?? []).length,
      tables: (markdown.match(/^\|(?: :?-+:? \|)+$/gm) ?? []).length,
    },
  }
}

function pageTitle(page: Document) {
  const meta = page.querySelector('meta[property="og:title"], meta[name="twitter:title"]')
  const value = tidy(meta?.getAttribute('content') ?? page.title ?? '')

  return value || null
}

/** Заголовок страницы полезен нейросети, но дублировать его незачем. */
function withTitle(title: string | null, markdown: string) {
  if (!title) return markdown

  const start = markdown.slice(0, 400)
  if (start.includes(title)) return markdown

  // В <title> обычно дописано название сайта, поэтому сравниваем по вхождению
  const heading = /^#{1,6} (.+)$/m.exec(start)?.[1]
  if (heading && heading.length > 10 && (title.includes(heading) || heading.includes(title))) {
    return markdown
  }

  return `# ${title}\n\n${markdown}`.trim()
}

/** Выбрасывает служебную разметку: сначала по тегам, затем по именам классов. */
function clean(page: Document) {
  for (const element of page.querySelectorAll(JUNK_TAGS)) element.remove()

  // Шапку, подвал и колонки убираем, только если они не часть самой статьи
  for (const element of page.querySelectorAll('aside, footer, header')) {
    if (!element.closest('article, main')) element.remove()
  }

  for (const element of page.querySelectorAll('[class], [id]')) {
    if (KEEP_TAGS.has(element.tagName.toLowerCase())) continue
    if (!JUNK_NAMES.test(`${element.getAttribute('class') ?? ''} ${element.id}`)) continue
    if (element.querySelector('article, main')) continue
    if (textLength(element) > RICH_TEXT && linkDensity(element) < 0.25) continue

    element.remove()
  }
}

/**
 * Ищет блок со статьёй. Сначала по разметке (article, main), иначе по плотности
 * текста: контейнер, в котором собраны длинные абзацы без россыпи ссылок.
 */
function pickMain(page: Document): Element | null {
  const body = page.body
  if (!body) return null

  const articles = [...page.querySelectorAll('article')].sort((a, b) => textLength(b) - textLength(a))
  if (articles[0] && textLength(articles[0]) > RICH_TEXT) return articles[0]

  const main = page.querySelector('main, [role="main"]')
  if (main && textLength(main) > 200) return main

  const scores = new Map<Element, number>()
  for (const node of page.querySelectorAll('p, pre, blockquote, figcaption')) {
    const text = node.textContent?.trim() ?? ''
    if (text.length < 25) continue

    // Длина и запятые — признаки живого текста, а не подписи к кнопке
    const score = 1 + Math.min(text.length / 100, 3) + (text.match(/[,;:]/g)?.length ?? 0) / 3
    let parent = node.parentElement

    for (let level = 1; parent && level <= 3; level++) {
      scores.set(parent, (scores.get(parent) ?? 0) + score / level)
      parent = parent.parentElement
    }
  }

  let best: Element = body
  let bestScore = 0
  for (const [element, score] of scores) {
    const weighted = score * (1 - linkDensity(element))
    if (weighted > bestScore) {
      bestScore = weighted
      best = element
    }
  }

  return textLength(best) < 200 ? body : best
}

function textLength(element: Element) {
  return element.textContent?.trim().length ?? 0
}

/** Доля текста, спрятанная в ссылках: у меню она близка к единице, у статьи мала. */
function linkDensity(element: Element) {
  const total = textLength(element)
  if (!total) return 1

  let inLinks = 0
  for (const anchor of element.querySelectorAll('a')) inLinks += textLength(anchor)

  return Math.min(1, inLinks / total)
}

/** Разбирает содержимое узла на блоки Markdown: абзацы, заголовки, списки, таблицы. */
function blocksOf(parent: Element): string[] {
  const blocks: string[] = []
  let buffer = ''

  function flush() {
    const text = tidy(buffer)
    if (text) blocks.push(text)
    buffer = ''
  }

  for (const node of parent.childNodes) {
    if (node.nodeType === TEXT_NODE) {
      buffer += node.nodeValue ?? ''
      continue
    }
    if (node.nodeType !== ELEMENT_NODE) continue

    const element = node as Element
    const tag = element.tagName.toLowerCase()

    if (tag === 'img' || tag === 'picture') continue
    if (tag === 'br' || INLINE.has(tag)) {
      buffer += inlineElement(element)
      continue
    }

    flush()

    if (HEADINGS.has(tag)) {
      const text = tidy(inlineOf(element)).replaceAll('\n', ' ')
      if (text) blocks.push(`${'#'.repeat(Number(tag[1]))} ${text}`)
      continue
    }

    switch (tag) {
      case 'hr':
        blocks.push('---')
        break

      case 'pre': {
        const code = codeBlock(element)
        if (code) blocks.push(code)
        break
      }

      case 'ul':
      case 'ol': {
        const list = listBlock(element, tag === 'ol')
        if (list) blocks.push(list)
        break
      }

      case 'dl':
        blocks.push(...definitionBlocks(element))
        break

      case 'table':
        blocks.push(...tableBlocks(element))
        break

      case 'blockquote': {
        const quote = join(blocksOf(element))
        if (quote) blocks.push(quote.split('\n').map((line) => `> ${line}`.trimEnd()).join('\n'))
        break
      }

      default:
        blocks.push(...blocksOf(element))
    }
  }

  flush()
  return blocks
}

/** Собирает строку из инлайновой разметки, сохраняя выделения и отбрасывая картинки. */
function inlineOf(parent: Element): string {
  let out = ''

  for (const node of parent.childNodes) {
    if (node.nodeType === TEXT_NODE) out += node.nodeValue ?? ''
    else if (node.nodeType === ELEMENT_NODE) out += inlineElement(node as Element)
  }

  return out
}

/** Один инлайновый элемент вместе с его собственным оформлением. */
function inlineElement(element: Element): string {
  const tag = element.tagName.toLowerCase()

  if (tag === 'img' || tag === 'picture') return ''
  if (tag === 'br') return '\n'
  // Сноски вида [1] в тексте только мешают
  if (tag === 'sup' && /^\[?\d{1,3}]?$/.test(element.textContent?.trim() ?? '')) return ''

  const inner = inlineOf(element)
  if (!inner.trim()) return inner

  switch (tag) {
    case 'strong':
    case 'b':
      return emphasis(inner, '**')

    case 'em':
    case 'i':
      return emphasis(inner, '*')

    case 'code':
    case 'kbd':
    case 'samp':
      return emphasis(inner.replaceAll('\n', ' '), '`')

    default:
      return inner
  }
}

/** Знаки выделения должны прилегать к тексту, иначе Markdown их не распознает. */
function emphasis(inner: string, mark: string) {
  const [, before, core, after] = /^(\s*)([\s\S]*?)(\s*)$/.exec(inner) ?? []
  if (!core) return inner

  return `${before}${mark}${core}${mark}${after}`
}

function listBlock(list: Element, ordered: boolean) {
  const lines: string[] = []
  let number = 1

  for (const item of childrenByTag(list, 'li')) {
    const content = blocksOf(item).join('\n').trim()
    if (!content) continue

    const marker = ordered ? `${number++}. ` : '- '
    const [first, ...rest] = content.split('\n')
    lines.push(marker + first, ...rest.map((line) => ' '.repeat(marker.length) + line))
  }

  return lines.join('\n')
}

/** Список определений читается как «термин — пояснение». */
function definitionBlocks(list: Element) {
  const lines: string[] = []

  for (const node of list.children) {
    const tag = node.tagName.toLowerCase()
    const text = tidy(inlineOf(node)).replaceAll('\n', ' ')
    if (!text) continue

    if (tag === 'dt') lines.push(`- **${text}**`)
    else if (tag === 'dd') lines.push(lines.length ? `  ${text}` : `- ${text}`)
  }

  return lines.length ? [lines.join('\n')] : []
}

function codeBlock(pre: Element) {
  const code = pre.textContent?.replace(/\s+$/, '') ?? ''
  if (!code.trim()) return ''

  const classes = `${pre.getAttribute('class') ?? ''} ${pre.querySelector('code')?.getAttribute('class') ?? ''}`
  const language = /(?:language|lang|highlight)-([\w+#.-]+)/i.exec(classes)?.[1] ?? ''
  const fence = code.includes('```') ? '~~~' : '```'

  return `${fence}${language}\n${code}\n${fence}`
}

/**
 * Таблица — главное, что нельзя терять: в Markdown она остаётся таблицей,
 * и связь «строка ↔ колонка» сохраняется. Таблицы-раскладки (одна колонка)
 * отдаются обычными абзацами, иначе получится мусор из палочек.
 */
function tableBlocks(table: Element): string[] {
  const rows = [...table.querySelectorAll(':scope > tr, :scope > thead > tr, :scope > tbody > tr, :scope > tfoot > tr')]
  const grid = rows
    .map((row) =>
      [...row.querySelectorAll(':scope > th, :scope > td')].flatMap((cell) => {
        const text = tidy(inlineOf(cell)).replaceAll('\n', ' ').replaceAll('|', '\\|')
        // Объединённые ячейки добиваем пустыми, чтобы колонки не разъехались
        const span = Math.min(Math.max(Number(cell.getAttribute('colspan')) || 1, 1), 20)
        return [text, ...Array.from({ length: span - 1 }, () => '')]
      }),
    )
    .filter((cells) => cells.some(Boolean))

  const width = Math.max(0, ...grid.map((cells) => cells.length))
  // Колонки, пустые во всех строках, остаются от вёрстки — от них один шум
  const columns = [...Array(width).keys()].filter((index) => grid.some((cells) => cells[index]))
  if (columns.length < 2 || grid.length < 2) return blocksOf(table)

  const lines = grid.map((cells) => `| ${columns.map((index) => cells[index] ?? '').join(' | ')} |`)
  lines.splice(1, 0, `| ${columns.map(() => '---').join(' | ')} |`)

  const caption = tidy(inlineOf(table.querySelector(':scope > caption') ?? table.ownerDocument.createElement('caption')))

  return caption ? [`**${caption}**`, lines.join('\n')] : [lines.join('\n')]
}

function childrenByTag(parent: Element, tag: string) {
  return [...parent.children].filter((child) => child.tagName.toLowerCase() === tag)
}

/** Схлопывает пробелы, но не переводы строк: они расставлены осмысленно. */
function tidy(text: string) {
  return text
    .replace(/[^\S\n]+/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
}

function join(blocks: string[]) {
  const out: string[] = []

  for (const block of blocks) {
    const text = block.trim()
    // Подряд идущие одинаковые блоки — обычно остатки меню и хлебных крошек
    if (!text || text === out.at(-1)) continue
    out.push(text)
  }

  return out.join('\n\n').replace(/\n{3,}/g, '\n\n')
}

/** Грубая оценка: кириллица токенизируется примерно вдвое дороже латиницы. */
function estimateTokens(text: string) {
  const cyrillic = (text.match(/[\u0400-\u04FF]/g) ?? []).length
  const latin = (text.match(/[A-Za-z]/g) ?? []).length
  const other = text.length - cyrillic - latin

  return Math.round(cyrillic / 2 + latin / 4 + other / 3)
}
