export interface SvgMatch {
  code: string
  /** Позиция в исходном тексте — по ней считается номер строки */
  start: number
  end: number
}

/**
 * Находит все <svg>…</svg> в произвольном тексте: лишние строки вокруг игнорируются.
 * Учитывает вложенные svg, самозакрывающийся тег, кавычки в атрибутах и комментарии,
 * поэтому обычным регулярным выражением это не заменить.
 */
export function extractSvgs(source: string): SvgMatch[] {
  const matches: SvgMatch[] = []
  let depth = 0
  let start = -1
  let index = 0

  while (index < source.length) {
    if (source[index] !== '<') {
      index++
      continue
    }

    if (source.startsWith('<!--', index)) {
      const commentEnd = source.indexOf('-->', index + 4)
      index = commentEnd === -1 ? source.length : commentEnd + 3
      continue
    }

    if (/^<svg[\s/>]/i.test(source.slice(index, index + 5))) {
      const tagEnd = findTagEnd(source, index)
      if (tagEnd === -1) break

      if (depth === 0) start = index

      if (source[tagEnd - 1] === '/') {
        if (depth === 0) {
          matches.push({ code: source.slice(start, tagEnd + 1), start, end: tagEnd + 1 })
          start = -1
        }
      } else {
        depth++
      }

      index = tagEnd + 1
      continue
    }

    if (/^<\/svg[\s>]/i.test(source.slice(index, index + 7))) {
      const tagEnd = findTagEnd(source, index)
      if (tagEnd === -1) break

      if (depth > 0) {
        depth--
        if (depth === 0 && start !== -1) {
          matches.push({ code: source.slice(start, tagEnd + 1), start, end: tagEnd + 1 })
          start = -1
        }
      }

      index = tagEnd + 1
      continue
    }

    index++
  }

  return matches
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

export function lineOf(source: string, position: number) {
  let line = 1
  for (let index = 0; index < position && index < source.length; index++) {
    if (source[index] === '\n') line++
  }
  return line
}
