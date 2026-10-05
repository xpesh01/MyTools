/**
 * Загрузка страницы по ссылке. Сначала пробуем забрать её напрямую — так данные
 * никуда не уходят, но большинство сайтов запрещают это заголовками CORS.
 * Для таких случаев есть посредник: ему уходит только сам адрес.
 */

/** Отдаёт исходный HTML, если попросить заголовком x-return-format. */
const PROXY = 'https://r.jina.ai/'

const TIMEOUT = 30_000

export interface LoadedPage {
  html: string
  url: string
  /** Как удалось получить страницу: напрямую из браузера или через посредника */
  via: 'direct' | 'proxy'
}

export async function fetchPage(input: string, signal?: AbortSignal): Promise<LoadedPage> {
  const url = normalize(input)

  try {
    return { html: await request(url, {}, signal), url, via: 'direct' }
  } catch (error) {
    if (signal?.aborted) throw error
    // Сайт не разрешил читать себя из чужой вкладки — идём через посредника
  }

  try {
    const html = await request(PROXY + url, { 'x-return-format': 'html' }, signal)
    return { html, url, via: 'proxy' }
  } catch (error) {
    if (signal?.aborted) throw error
    throw new Error(`Не удалось загрузить страницу: ${(error as Error).message}`)
  }
}

/** Человек пишет «example.com», а fetch хочет полный адрес. */
function normalize(input: string) {
  const value = input.trim()
  if (!value) throw new Error('Укажите адрес страницы.')

  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`

  try {
    return new URL(withScheme).toString()
  } catch {
    throw new Error('Это не похоже на адрес страницы.')
  }
}

async function request(url: string, headers: Record<string, string>, signal?: AbortSignal) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT)
  signal?.addEventListener('abort', () => controller.abort(), { once: true })

  try {
    const response = await fetch(url, { headers, signal: controller.signal, redirect: 'follow' })
    if (!response.ok) throw new Error(`сервер ответил ${response.status}`)

    return decode(await response.arrayBuffer(), response.headers.get('content-type'))
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Кодировка берётся из заголовка ответа, а если там её нет — из самой страницы:
 * русские сайты до сих пор встречаются в windows-1251.
 */
function decode(buffer: ArrayBuffer, contentType: string | null) {
  const start = new TextDecoder('latin1').decode(buffer.slice(0, 4096))
  const charset =
    /charset=["']?([\w-]+)/i.exec(contentType ?? '')?.[1] ??
    /<meta[^>]+charset=["']?([\w-]+)/i.exec(start)?.[1] ??
    'utf-8'

  try {
    return new TextDecoder(charset).decode(buffer)
  } catch {
    return new TextDecoder().decode(buffer)
  }
}
