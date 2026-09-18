export interface SvgMatch {
  code: string
  /** Номер строки, на которой начинается SVG */
  line: number
  /** Позиция в исходном тексте */
  start: number
  end: number
}

/** Незакрытый <svg> длиннее этого считаем мусором: иначе одна опечатка съест весь файл. */
const MAX_SVG_LENGTH = 4 * 1024 * 1024

/** Столько символов ждём закрывающую '>'. Дальше это уже не тег, а обычный текст. */
const MAX_TAG_LENGTH = 64 * 1024

/** Резать буфер ради пары килобайт дороже, чем их подержать. */
const TRIM_THRESHOLD = 64 * 1024

/** Самый длинный тег, который нужно опознать целиком: '</svg' + пробел + '>'. */
const LOOKAHEAD = 7

const SVG_OPEN = /^<svg[\s/>]/i
const SVG_CLOSE = /^<\/svg[\s>]/i

/**
 * Разбор текста по частям: внутри живёт только текущий кусок и, если он начался,
 * текущий SVG. Благодаря этому файл любого размера читается потоком, а в памяти
 * оседает лишь то, что действительно нашлось.
 *
 * Учитывает вложенные svg, самозакрывающийся тег, кавычки в атрибутах и комментарии,
 * поэтому обычным регулярным выражением это не заменить.
 */
export class SvgScanner {
  /** Сколько SVG пришлось бросить из-за MAX_SVG_LENGTH */
  skipped = 0

  private buffer = ''
  /** Абсолютный индекс первого символа буфера в потоке */
  private base = 0
  /** Абсолютный индекс, до которого текст уже разобран */
  private cursor = 0
  private depth = 0
  /** Абсолютный индекс начала текущего SVG или -1, если мы снаружи */
  private startedAt = -1
  private inComment = false
  /** Номер строки в позиции counted */
  private line = 1
  /** Абсолютный индекс, до которого посчитаны переводы строк */
  private counted = 0

  /** Добавляет очередной кусок текста и возвращает SVG, которые на нём дочитались. */
  push(chunk: string): SvgMatch[] {
    this.buffer += chunk
    return this.scan(false)
  }

  /** Досканировать остаток. Незакрытый SVG в конце текста отбрасывается. */
  end(): SvgMatch[] {
    return this.scan(true)
  }

  private scan(final: boolean): SvgMatch[] {
    const matches: SvgMatch[] = []

    while (this.cursor < this.base + this.buffer.length) {
      this.dropOverlong()

      if (this.inComment) {
        const closing = this.buffer.indexOf('-->', this.cursor - this.base)
        if (closing === -1) {
          // Тело комментария наружу не нужно, оставляем только хвост под '-->'
          this.cursor = Math.max(this.cursor, this.base + this.buffer.length - 2)
          break
        }
        this.inComment = false
        this.cursor = this.base + closing + 3
        continue
      }

      const at = this.buffer.indexOf('<', this.cursor - this.base)
      if (at === -1) {
        this.cursor = this.base + this.buffer.length
        break
      }
      this.cursor = this.base + at
      // По позиции тега, а не конца текста: иначе SVG сразу за брошенным фрагментом потеряется
      this.dropOverlong()

      const rest = this.buffer.length - at
      if (rest < LOOKAHEAD && !final) break

      if (this.buffer.startsWith('<!--', at)) {
        const closing = this.buffer.indexOf('-->', at + 4)
        if (closing === -1) {
          this.inComment = true
          this.cursor = this.base + Math.max(at + 4, this.buffer.length - 2)
          break
        }
        this.cursor = this.base + closing + 3
        continue
      }

      const opening = SVG_OPEN.test(this.buffer.slice(at, at + 5))
      if (!opening && !SVG_CLOSE.test(this.buffer.slice(at, at + LOOKAHEAD))) {
        this.cursor = this.base + at + 1
        continue
      }

      const tagEnd = findTagEnd(this.buffer, at)
      if (tagEnd === -1) {
        // Тег может продолжаться в следующем куске — но не бесконечно
        if (!final && rest < MAX_TAG_LENGTH) break
        this.cursor = this.base + at + 1
        continue
      }

      if (opening) {
        if (this.depth === 0) this.startedAt = this.base + at

        if (this.buffer[tagEnd - 1] === '/') {
          if (this.depth === 0) matches.push(this.take(tagEnd + 1))
        } else {
          this.depth++
        }
      } else if (this.depth > 0) {
        this.depth--
        if (this.depth === 0 && this.startedAt !== -1) matches.push(this.take(tagEnd + 1))
      }

      this.cursor = this.base + tagEnd + 1
    }

    this.trim()
    return matches
  }

  /**
   * Бросает слишком длинный фрагмент: скорее всего, '<svg' попался в тексте случайно.
   * Разбор продолжается с текущего места, а не с начала фрагмента, — так он остаётся
   * линейным, и буфер перестаёт расти.
   */
  private dropOverlong() {
    if (this.startedAt === -1 || this.cursor - this.startedAt <= MAX_SVG_LENGTH) return

    this.skipped++
    this.startedAt = -1
    this.depth = 0
  }

  /** Вырезает найденный SVG из буфера и считает его строку. */
  private take(endInBuffer: number): SvgMatch {
    const match: SvgMatch = {
      code: this.buffer.slice(this.startedAt - this.base, endInBuffer),
      line: this.lineAt(this.startedAt),
      start: this.startedAt,
      end: this.base + endInBuffer,
    }

    this.startedAt = -1
    return match
  }

  /**
   * Номер строки для позиции. Позиции приходят только по возрастанию, поэтому каждый
   * перевод строки встречается ровно один раз — иначе на большом файле счёт строк
   * стоил бы дороже самого разбора.
   */
  private lineAt(position: number) {
    const to = position - this.base
    let index = this.counted - this.base

    for (;;) {
      const next = this.buffer.indexOf('\n', index)
      if (next === -1 || next >= to) break
      this.line++
      index = next + 1
    }

    this.counted = position
    return this.line
  }

  /** Отпускает разобранное начало буфера, досчитав в нём строки. */
  private trim() {
    const keepFrom = this.startedAt === -1 ? this.cursor : this.startedAt
    const cut = keepFrom - this.base
    if (cut < TRIM_THRESHOLD) return

    this.lineAt(keepFrom)
    this.buffer = this.buffer.slice(cut)
    this.base = keepFrom
  }
}

/** Находит все <svg>…</svg> в готовой строке: лишний текст вокруг игнорируется. */
export function extractSvgs(source: string): SvgMatch[] {
  const scanner = new SvgScanner()
  return [...scanner.push(source), ...scanner.end()]
}

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg'
const XLINK_NAMESPACE = 'http://www.w3.org/1999/xlink'

/**
 * Внутри HTML и JSX xmlns не обязателен, но отдельный файл или <img> без него не отрисуется,
 * а необъявленный префикс xlink вообще ломает XML-разбор. Поэтому дописываем их сами.
 */
export function withNamespaces(code: string) {
  const tagEnd = findTagEnd(code, 0)
  if (tagEnd === -1) return code

  const openTag = code.slice(0, tagEnd)
  let additions = ''

  if (!/\sxmlns\s*=/i.test(openTag)) {
    additions += ` xmlns="${SVG_NAMESPACE}"`
  }
  if (/xlink:/i.test(code) && !/\sxmlns:xlink\s*=/i.test(openTag)) {
    additions += ` xmlns:xlink="${XLINK_NAMESPACE}"`
  }
  if (!additions) return code

  // У самозакрывающегося тега атрибуты идут до слеша
  const insertAt = code[tagEnd - 1] === '/' ? tagEnd - 1 : tagEnd
  return code.slice(0, insertAt) + additions + code.slice(insertAt)
}

/** Ищет закрывающую '>' тега, пропуская её внутри значений атрибутов. */
function findTagEnd(source: string, from: number) {
  let quote: string | null = null

  for (let index = from; index < source.length; index++) {
    const char = source[index]

    if (quote) {
      if (char === quote) quote = null
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    if (char === '>') return index
  }

  return -1
}

/**
 * Разэкранирование на случай, когда SVG скопирован из JSON, HTML-атрибута или лога.
 * Применяется как запасной вариант, если в исходном виде ничего не нашлось.
 */
export function unescapeMarkup(source: string) {
  return source
    .replace(/\\u003c/gi, '<')
    .replace(/\\u003e/gi, '>')
    .replace(/\\u0022/gi, '"')
    .replaceAll('\\n', '\n')
    .replaceAll('\\"', '"')
    .replaceAll("\\'", "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&amp;', '&')
}

/** Самая длинная последовательность, которую умеет разбирать unescapeMarkup. */
export const MAX_ESCAPE_LENGTH = 6

export interface SvgInfo {
  width: string | null
  height: string | null
  viewBox: string | null
  title: string | null
  id: string | null
  /** Скрипт внутри SVG не выполнится в <img>, но предупредить стоит */
  hasScript: boolean
  error: string | null
}

/** Разбирает SVG браузерным парсером: заодно проверяет, что разметка валидна. */
export function inspectSvg(code: string): SvgInfo {
  const empty: SvgInfo = {
    width: null,
    height: null,
    viewBox: null,
    title: null,
    id: null,
    hasScript: /<script[\s>]/i.test(code),
    error: null,
  }

  const document_ = new DOMParser().parseFromString(code, 'image/svg+xml')
  const parseError = document_.querySelector('parsererror')
  const root = document_.documentElement

  if (parseError || root.nodeName.toLowerCase() !== 'svg') {
    const message = (parseError?.textContent ?? '').trim().split('\n')[0]
    return { ...empty, error: message || 'Не удалось разобрать разметку SVG.' }
  }

  return {
    ...empty,
    width: root.getAttribute('width'),
    height: root.getAttribute('height'),
    viewBox: root.getAttribute('viewBox'),
    title: document_.querySelector('title')?.textContent?.trim() || null,
    id: root.getAttribute('id'),
  }
}

/** Имя файла из <title> или id, иначе просто номер по порядку. */
export function suggestFileName(info: SvgInfo, index: number) {
  const fallback = `svg-${index + 1}`
  const source = info.title ?? info.id ?? fallback
  const slug = source
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)

  return `${slug || fallback}.svg`
}

/** Data URL для превью и скачивания. encodeURIComponent, а не base64 — работает с любым текстом. */
export function toDataUrl(code: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(code)}`
}
