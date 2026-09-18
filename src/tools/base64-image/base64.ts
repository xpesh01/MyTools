export interface DecodedImage {
  dataUrl: string
  mime: string
  bytes: number
  /** Нормализованный base64 без префикса data: */
  base64: string
}

export type DecodeResult = { ok: true; image: DecodedImage } | { ok: false; error: string }

const DATA_URL_RE = /^data:([^;,]*)(;[^,]*)?,/i
const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/

export function decodeBase64Image(input: string): DecodeResult {
  const source = input.trim()
  if (!source) return { ok: false, error: '' }

  let declaredMime = ''
  let payload = source

  const dataUrl = DATA_URL_RE.exec(source)
  if (dataUrl) {
    if (!/;base64/i.test(dataUrl[2] ?? '')) {
      return { ok: false, error: 'Data URL без ;base64 — такие данные не декодируются как base64.' }
    }
    declaredMime = dataUrl[1].toLowerCase()
    payload = source.slice(dataUrl[0].length)
  }

  const normalized = normalizeBase64(payload)
  if (!BASE64_RE.test(normalized)) {
    return { ok: false, error: 'В строке есть символы, недопустимые для base64.' }
  }

  let bytes: Uint8Array
  try {
    const binary = atob(normalized)
    bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  } catch {
    return { ok: false, error: 'Строка обрывается: длина base64 должна быть кратна 4.' }
  }

  const sniffed = sniffImageMime(bytes)
  const mime = sniffed ?? declaredMime
  if (!mime.startsWith('image/')) {
    return {
      ok: false,
      error: sniffed
        ? 'Данные декодировались, но это не изображение.'
        : 'Не удалось определить формат изображения по содержимому.',
    }
  }

  return {
    ok: true,
    image: {
      dataUrl: `data:${mime};base64,${normalized}`,
      mime,
      bytes: bytes.length,
      base64: normalized,
    },
  }
}

/** Убирает переносы строк и приводит url-safe алфавит к обычному, добавляя padding. */
function normalizeBase64(value: string) {
  const cleaned = value.replace(/\s+/g, '').replaceAll('-', '+').replaceAll('_', '/').replace(/=+$/, '')
  const remainder = cleaned.length % 4
  return remainder === 0 ? cleaned : cleaned + '='.repeat(4 - remainder)
}

/** Определяет формат по сигнатуре первых байт — надёжнее, чем доверять префиксу. */
export function sniffImageMime(bytes: Uint8Array): string | null {
  const starts = (...signature: number[]) => signature.every((byte, index) => bytes[index] === byte)

  if (starts(0x89, 0x50, 0x4e, 0x47)) return 'image/png'
  if (starts(0xff, 0xd8, 0xff)) return 'image/jpeg'
  if (starts(0x47, 0x49, 0x46, 0x38)) return 'image/gif'
  if (starts(0x42, 0x4d)) return 'image/bmp'
  if (starts(0x00, 0x00, 0x01, 0x00)) return 'image/x-icon'
  if (starts(0x49, 0x49, 0x2a, 0x00) || starts(0x4d, 0x4d, 0x00, 0x2a)) return 'image/tiff'
  if (starts(0x52, 0x49, 0x46, 0x46) && starts0(bytes, 8, 'WEBP')) return 'image/webp'

  const head = new TextDecoder().decode(bytes.slice(0, 256)).trimStart()
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) {
    return 'image/svg+xml'
  }

  return null
}

function starts0(bytes: Uint8Array, offset: number, text: string) {
  return [...text].every((char, index) => bytes[offset + index] === char.charCodeAt(0))
}

export function base64FromDataUrl(dataUrl: string) {
  const comma = dataUrl.indexOf(',')
  return comma === -1 ? dataUrl : dataUrl.slice(comma + 1)
}

export function extensionForMime(mime: string) {
  const map: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/bmp': 'bmp',
    'image/x-icon': 'ico',
    'image/tiff': 'tiff',
    'image/svg+xml': 'svg',
  }
  return map[mime] ?? 'bin'
}
