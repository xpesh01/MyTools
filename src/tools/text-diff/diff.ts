export type DiffOp = 'equal' | 'insert' | 'delete'

export interface DiffChunk {
  op: DiffOp
  text: string
}

export interface DiffResult {
  chunks: DiffChunk[]
  /** Сколько символов добавлено во второй текст */
  added: number
  /** Сколько символов пропало из первого текста */
  removed: number
  /** Индекс первого различия в символах, null — тексты совпадают */
  firstDifference: number | null
  /** true, если для точного diff текст слишком большой и блоки показаны целиком */
  approximate: boolean
}

/** Ограничение на таблицу динамики: ~4 млн ячеек это порядка 16 МБ и десятки мс. */
const MAX_CELLS = 4_000_000

/**
 * Посимвольное сравнение через наибольшую общую подпоследовательность.
 * Сравниваются кодовые точки, поэтому эмодзи и составные символы не рвутся пополам.
 */
export function diffChars(a: string, b: string): DiffResult {
  const left = [...a]
  const right = [...b]

  // Одинаковые начало и конец в таблицу не попадают — так diff считается заметно быстрее
  let start = 0
  while (start < left.length && start < right.length && left[start] === right[start]) start++

  let endLeft = left.length
  let endRight = right.length
  while (endLeft > start && endRight > start && left[endLeft - 1] === right[endRight - 1]) {
    endLeft--
    endRight--
  }

  const middle = diffMiddle(left.slice(start, endLeft), right.slice(start, endRight))

  const chunks: DiffChunk[] = []
  if (start > 0) chunks.push({ op: 'equal', text: left.slice(0, start).join('') })
  chunks.push(...middle.chunks)
  if (endLeft < left.length) chunks.push({ op: 'equal', text: left.slice(endLeft).join('') })

  let added = 0
  let removed = 0
  for (const chunk of middle.chunks) {
    const length = [...chunk.text].length
    if (chunk.op === 'insert') added += length
    if (chunk.op === 'delete') removed += length
  }

  return {
    chunks,
    added,
    removed,
    firstDifference: middle.chunks.length === 0 ? null : start,
    approximate: middle.approximate,
  }
}

function diffMiddle(left: string[], right: string[]): { chunks: DiffChunk[]; approximate: boolean } {
  if (left.length === 0 && right.length === 0) return { chunks: [], approximate: false }
  if (left.length === 0) {
    return { chunks: [{ op: 'insert', text: right.join('') }], approximate: false }
  }
  if (right.length === 0) {
    return { chunks: [{ op: 'delete', text: left.join('') }], approximate: false }
  }

  if ((left.length + 1) * (right.length + 1) > MAX_CELLS) {
    return {
      chunks: [
        { op: 'delete', text: left.join('') },
        { op: 'insert', text: right.join('') },
      ],
      approximate: true,
    }
  }

  const width = right.length + 1
  const lcs = new Uint32Array((left.length + 1) * width)
  for (let i = left.length - 1; i >= 0; i--) {
    for (let j = right.length - 1; j >= 0; j--) {
      lcs[i * width + j] =
        left[i] === right[j]
          ? lcs[(i + 1) * width + j + 1] + 1
          : Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1])
    }
  }

  const chunks: DiffChunk[] = []
  const push = (op: DiffOp, char: string) => {
    const last = chunks.at(-1)
    if (last?.op === op) last.text += char
    else chunks.push({ op, text: char })
  }

  let i = 0
  let j = 0
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      push('equal', left[i])
      i++
      j++
    } else if (lcs[(i + 1) * width + j] >= lcs[i * width + j + 1]) {
      push('delete', left[i])
      i++
    } else {
      push('insert', right[j])
      j++
    }
  }
  while (i < left.length) push('delete', left[i++])
  while (j < right.length) push('insert', right[j++])

  return { chunks, approximate: false }
}

/** Делает пробелы и переносы видимыми — иначе «пустой» diff выглядит непонятно. */
export function revealWhitespace(text: string) {
  return text.replaceAll(' ', '·').replaceAll('\t', '→   ').replaceAll('\n', '↵\n')
}
