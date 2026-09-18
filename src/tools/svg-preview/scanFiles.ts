import type { SvgMatch } from './extractSvg.ts'
import { MAX_ESCAPE_LENGTH, SvgScanner, unescapeMarkup } from './extractSvg.ts'

/** Читаем по мегабайту: между кусками браузер успевает перерисовать прогресс. */
const CHUNK_SIZE = 1024 * 1024

/** Столько разных SVG держим в памяти. Дальше список всё равно никто не пролистает. */
export const MAX_UNIQUE = 2000

/** Чаще обновлять прогресс бессмысленно: глазу хватает, а рендеров меньше. */
const PROGRESS_INTERVAL = 100

const encoder = new TextEncoder()

export interface FoundSvg {
  code: string
  line: number
  /** Сколько раз встретился ровно такой же SVG */
  count: number
  bytes: number
  /** Имя файла — заполняется, только если файлов было несколько */
  source?: string
}

export interface ScanResult {
  items: FoundSvg[]
  /** Всего вхождений, вместе с повторами */
  found: number
  /** Разных SVG оказалось больше MAX_UNIQUE, часть в список не попала */
  truncated: boolean
  /** Сколько фрагментов брошено из-за незакрытого тега */
  skipped: number
  /** Разметку пришлось разэкранировать */
  unescaped: boolean
  /** Чтение прервано пользователем */
  stopped: boolean
}

export interface ScanProgress {
  bytesRead: number
  totalBytes: number
  found: number
  unique: number
}

export interface ScanOptions {
  signal?: AbortSignal
  onProgress?: (progress: ScanProgress) => void
}

/**
 * Копит найденное, схлопывая одинаковые SVG: в логах одна и та же иконка
 * встречается сотнями, и держать её копии незачем.
 */
export class SvgCollector {
  found = 0
  truncated = false

  private unique = new Map<string, FoundSvg>()

  add(matches: SvgMatch[], source?: string) {
    for (const match of matches) {
      this.found++

      const same = this.unique.get(match.code)
      if (same) {
        same.count++
        continue
      }

      if (this.unique.size >= MAX_UNIQUE) {
        this.truncated = true
        continue
      }

      this.unique.set(match.code, {
        code: match.code,
        line: match.line,
        count: 1,
        bytes: encoder.encode(match.code).length,
        source,
      })
    }
  }

  get size() {
    return this.unique.size
  }

  items(): FoundSvg[] {
    return [...this.unique.values()]
  }
}

/**
 * Читает файлы кусками и возвращает только найденные SVG: сам текст нигде не оседает,
 * поэтому размер файла упирается не в память вкладки, а во время чтения с диска.
 */
export async function scanFiles(files: File[], options: ScanOptions = {}): Promise<ScanResult> {
  const direct = await read(files, false, options)
  if (direct.found > 0 || direct.stopped) return direct

  // Запасной заход: SVG мог приехать экранированным — из JSON, атрибута или лога
  const decoded = await read(files, true, options)
  return { ...decoded, unescaped: decoded.found > 0 }
}

async function read(files: File[], decode: boolean, { signal, onProgress }: ScanOptions): Promise<ScanResult> {
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0)
  const collector = new SvgCollector()
  /** Имя файла нужно, только когда их несколько: иначе оно во всех карточках одинаковое */
  const named = files.length > 1

  let bytesRead = 0
  let skipped = 0
  let stopped = false
  let reportedAt = 0

  function report(force: boolean) {
    const now = performance.now()
    if (!force && now - reportedAt < PROGRESS_INTERVAL) return

    reportedAt = now
    onProgress?.({ bytesRead, totalBytes, found: collector.found, unique: collector.size })
  }

  for (const file of files) {
    const scanner = new SvgScanner()
    const decoder = new TextDecoder()
    const source = named ? file.name : undefined
    let pending = ''

    for (let offset = 0; offset < file.size; offset += CHUNK_SIZE) {
      if (signal?.aborted) {
        stopped = true
        break
      }

      // await между кусками — та самая пауза, в которую вкладка успевает откликнуться
      const buffer = await file.slice(offset, offset + CHUNK_SIZE).arrayBuffer()
      let text = decoder.decode(buffer, { stream: true })

      if (decode) {
        pending += text
        const cut = cutPoint(pending)
        text = unescapeMarkup(pending.slice(0, cut))
        pending = pending.slice(cut)
      }

      collector.add(scanner.push(text), source)
      bytesRead += buffer.byteLength
      report(false)
    }

    if (stopped) break

    const rest = decoder.decode()
    collector.add(scanner.push(decode ? unescapeMarkup(pending + rest) : rest), source)
    collector.add(scanner.end(), source)
    skipped += scanner.skipped
  }

  report(true)

  return {
    items: collector.items(),
    found: collector.found,
    truncated: collector.truncated,
    skipped,
    unescaped: false,
    stopped,
  }
}

/**
 * Граница, по которой можно разрезать текст, не разорвав экранированную
 * последовательность: ищем ближайшее начало ('&' или '\') в хвосте. Внутрь
 * последовательности такой символ попасть не может, поэтому резать по нему безопасно.
 */
function cutPoint(text: string) {
  for (let index = Math.max(0, text.length - MAX_ESCAPE_LENGTH); index < text.length; index++) {
    const char = text[index]
    if (char === '&' || char === '\\') return index
  }

  return text.length
}
