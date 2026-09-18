import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import {
  Button,
  Callout,
  CopyButton,
  Field,
  SegmentedControl,
  Stats,
  TextArea,
  Toolbar,
} from '../../components/ui.tsx'
import { cx } from '../../lib/cx.ts'
import { formatBytes } from '../../lib/format.ts'
import type { SvgInfo } from './extractSvg.ts'
import {
  extractSvgs,
  inspectSvg,
  suggestFileName,
  toDataUrl,
  unescapeMarkup,
  withNamespaces,
} from './extractSvg.ts'
import type { FoundSvg, ScanProgress, ScanResult } from './scanFiles.ts'
import { MAX_UNIQUE, SvgCollector, scanFiles } from './scanFiles.ts'
import './SvgPreviewTool.css'

type Background = 'checker' | 'light' | 'dark'

/** Файл читается потоком и в поле ввода не попадает, так что предел тут — про здравый смысл. */
const MAX_FILE_SIZE = 1024 * 1024 * 1024

/** Сколько карточек рисуем за раз: каждая — это разбор SVG и ещё одна картинка в памяти. */
const PAGE = 60

const TEXT_FILE_TYPES = '.log,.txt,.svg,.json,.xml,.html,.htm,.md,.csv,.js,.jsx,.ts,.tsx,.vue,.css,text/*'

/** Общая пустышка: новый литерал на каждый рендер сбрасывал бы useMemo с карточками. */
const NOTHING: FoundSvg[] = []

export default function SvgPreviewTool() {
  const [input, setInput] = useState('')
  const [background, setBackground] = useState<Background>('checker')
  const [dragging, setDragging] = useState(false)
  const [loaded, setLoaded] = useState<{ names: string[]; bytes: number } | null>(null)
  const [scan, setScan] = useState<ScanResult | null>(null)
  const [progress, setProgress] = useState<ScanProgress | null>(null)
  const [fileError, setFileError] = useState('')
  const [visible, setVisible] = useState(PAGE)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const scanRef = useRef<AbortController | null>(null)

  useEffect(() => () => scanRef.current?.abort(), [])

  const deferredInput = useDeferredValue(input)
  const textResult = useMemo(() => parseText(deferredInput), [deferredInput])

  const result = loaded ? scan : textResult
  const items = result?.items ?? NOTHING

  // Разбор и data URL стоят дорого, поэтому считаем их только для показанных карточек
  const cards = useMemo(() => items.slice(0, visible).map(toCard), [items, visible])

  const totalBytes = items.reduce((sum, item) => sum + item.bytes, 0)
  const brokenCount = cards.filter((card) => card.info.error).length

  async function loadFiles(files: FileList | null) {
    const list = [...(files ?? [])]
    if (list.length === 0) return

    const tooBig = list.find((file) => file.size > MAX_FILE_SIZE)
    if (tooBig) {
      setFileError(
        `«${tooBig.name}» весит ${formatBytes(tooBig.size)} — это больше ${formatBytes(MAX_FILE_SIZE)}.`,
      )
      return
    }

    scanRef.current?.abort()
    const controller = new AbortController()
    scanRef.current = controller

    const bytes = list.reduce((sum, file) => sum + file.size, 0)
    setFileError('')
    setInput('')
    setScan(null)
    setVisible(PAGE)
    setLoaded({ names: list.map((file) => file.name), bytes })
    setProgress({ bytesRead: 0, totalBytes: bytes, found: 0, unique: 0 })

    try {
      const found = await scanFiles(list, { signal: controller.signal, onProgress: setProgress })
      // Пока читали, могли загрузить другой файл — тогда результат уже не нужен
      if (scanRef.current !== controller) return
      setScan(found)
    } catch {
      if (scanRef.current !== controller) return
      setFileError('Не удалось прочитать файл.')
      setLoaded(null)
    } finally {
      if (scanRef.current === controller) {
        scanRef.current = null
        setProgress(null)
      }
    }
  }

  function reset() {
    scanRef.current?.abort()
    scanRef.current = null
    setInput('')
    setLoaded(null)
    setScan(null)
    setProgress(null)
    setFileError('')
    setVisible(PAGE)
  }

  return (
    <div className="tool-body">
      <Field
        label="Текст с SVG"
        action={
          <Toolbar>
            <Button
              variant="ghost"
              className="btn--compact"
              onClick={() => fileInputRef.current?.click()}
            >
              Открыть файл
            </Button>
            <Button
              variant="ghost"
              className="btn--compact"
              disabled={!input && !loaded}
              onClick={reset}
            >
              Очистить
            </Button>
          </Toolbar>
        }
        hint="Лишний текст вокруг можно не убирать. Файл читается по кускам, и в поле он не попадает — из него забираются только сами SVG, поэтому размер лога значения не имеет."
      >
        <div
          className={cx('drop-area', dragging && 'drop-area--active')}
          onDragOver={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragLeave={(event) => {
            // Переход курсора на дочерний элемент тоже даёт dragleave — его игнорируем
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false)
          }}
          onDrop={(event) => {
            event.preventDefault()
            setDragging(false)
            void loadFiles(event.dataTransfer.files)
          }}
        >
          {loaded ? (
            <div className="scan-panel">
              <p className="loaded-file">
                {loaded.names.join(', ')} · {formatBytes(loaded.bytes)}
              </p>

              {progress ? (
                <ScanProgressView progress={progress} onStop={() => scanRef.current?.abort()} />
              ) : (
                <p className="scan-panel__done">
                  {scan?.stopped
                    ? 'Чтение остановлено. Чтобы вернуться к тексту, нажмите «Очистить».'
                    : 'Файл прочитан, в поле ввода он не загружался. Чтобы вернуться к тексту, нажмите «Очистить».'}
                </p>
              )}
            </div>
          ) : (
            <TextArea
              value={input}
              onChange={(event) => {
                setInput(event.target.value)
                setVisible(PAGE)
              }}
              placeholder={
                'Вставьте текст или перетащите сюда файл (.log, .txt, .svg, .json…), например:\n\nicon: <svg viewBox="0 0 24 24">…</svg>'
              }
            />
          )}
          {dragging && <p className="drop-area__overlay">Отпустите файл — из него заберутся SVG</p>}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept={TEXT_FILE_TYPES}
          multiple
          hidden
          onChange={(event) => {
            void loadFiles(event.target.files)
            // Сбрасываем значение, иначе повторный выбор того же файла не вызовет change
            event.target.value = ''
          }}
        />

        {fileError && <Callout tone="error">{fileError}</Callout>}
      </Field>

      {!loaded && !input.trim() && (
        <Callout>Вставьте текст или загрузите файл — все найденные SVG появятся ниже.</Callout>
      )}

      {result && items.length === 0 && (loaded || input.trim()) && (
        <Callout tone="error">
          SVG не найден: нужен открывающий тег <code>&lt;svg</code> и закрывающий <code>&lt;/svg&gt;</code>.
        </Callout>
      )}

      {items.length > 0 && result && (
        <>
          {result.unescaped && (
            <Callout>
              В исходном виде SVG не читался, поэтому разметка была разэкранирована — так бывает при
              копировании из JSON или HTML-атрибута.
            </Callout>
          )}

          {result.stopped && (
            <Callout>Чтение остановлено — показано то, что нашлось в прочитанной части.</Callout>
          )}

          {result.truncated && (
            <Callout>
              Разных SVG оказалось больше {MAX_UNIQUE} — показаны первые, остальные пропущены, чтобы
              не занимать память.
            </Callout>
          )}

          {result.skipped > 0 && (
            <Callout>
              Пропущено фрагментов: {result.skipped}. У них не нашлось закрывающего{' '}
              <code>&lt;/svg&gt;</code> на разумном расстоянии.
            </Callout>
          )}

          <Stats
            items={[
              { label: 'Найдено', value: result.found },
              ...(result.found === items.length ? [] : [{ label: 'Из них разных', value: items.length }]),
              ...(cards.length < items.length ? [{ label: 'Показано', value: cards.length }] : []),
              { label: 'Суммарный размер', value: formatBytes(totalBytes) },
              ...(brokenCount > 0 ? [{ label: 'С ошибками', value: brokenCount }] : []),
            ]}
          />

          <Toolbar>
            <SegmentedControl<Background>
              value={background}
              onChange={setBackground}
              label="Фон превью"
              options={[
                { value: 'checker', label: 'Прозрачный' },
                { value: 'light', label: 'Светлый' },
                { value: 'dark', label: 'Тёмный' },
              ]}
            />
          </Toolbar>

          <div className="svg-grid">
            {cards.map((card, index) => (
              <figure key={`${card.item.line}-${index}`} className="svg-card">
                <div className={cx('svg-canvas', `svg-canvas--${background}`)}>
                  {card.info.error ? (
                    <span className="svg-canvas__broken">не отображается</span>
                  ) : (
                    <img src={card.dataUrl} alt={card.fileName} loading="lazy" />
                  )}
                </div>

                <figcaption className="svg-card__body">
                  <div className="svg-card__head">
                    <strong className="svg-card__name">{card.fileName}</strong>
                    <span className="svg-card__line">
                      {card.item.source ? `${card.item.source}, ` : ''}строка {card.item.line}
                      {card.item.count > 1 && ` · ×${card.item.count}`}
                    </span>
                  </div>

                  <p className="svg-card__meta">{describe(card.info, card.item.bytes)}</p>

                  {card.info.error && <Callout tone="error">{card.info.error}</Callout>}
                  {card.info.hasScript && (
                    <Callout>
                      Внутри есть <code>&lt;script&gt;</code> — в превью он не запускается, но перед
                      использованием файл стоит проверить.
                    </Callout>
                  )}

                  <Toolbar>
                    <a
                      className="btn btn--ghost btn--compact"
                      href={card.dataUrl}
                      download={card.fileName}
                    >
                      Скачать
                    </a>
                    <CopyButton value={card.code} label="Копировать код" />
                  </Toolbar>
                </figcaption>
              </figure>
            ))}
          </div>

          {cards.length < items.length && (
            <Toolbar>
              <Button onClick={() => setVisible((shown) => shown + PAGE)}>
                Показать ещё {Math.min(PAGE, items.length - cards.length)}
              </Button>
            </Toolbar>
          )}
        </>
      )}
    </div>
  )
}

function ScanProgressView({ progress, onStop }: { progress: ScanProgress; onStop: () => void }) {
  const percent = progress.totalBytes
    ? Math.min(100, Math.round((progress.bytesRead / progress.totalBytes) * 100))
    : 0

  return (
    <div className="scan-progress">
      <div
        className="scan-progress__track"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span className="scan-progress__bar" style={{ width: `${percent}%` }} />
      </div>

      <div className="scan-progress__meta">
        <span>
          Прочитано {formatBytes(progress.bytesRead)} из {formatBytes(progress.totalBytes)} · найдено{' '}
          {progress.found}
        </span>
        <Button variant="ghost" className="btn--compact" onClick={onStop}>
          Остановить
        </Button>
      </div>
    </div>
  )
}

interface Card {
  item: FoundSvg
  code: string
  info: SvgInfo
  dataUrl: string
  fileName: string
}

function toCard(item: FoundSvg, index: number): Card {
  const code = withNamespaces(item.code)
  const info = inspectSvg(code)

  return { item, code, info, dataUrl: toDataUrl(code), fileName: suggestFileName(info, index) }
}

/** Разбор того, что вставили руками: текст небольшой, поэтому читаем его целиком. */
function parseText(input: string): ScanResult {
  const collector = new SvgCollector()
  let matches = extractSvgs(input)
  let unescaped = false

  if (matches.length === 0 && input.trim()) {
    const decoded = extractSvgs(unescapeMarkup(input))
    if (decoded.length > 0) {
      matches = decoded
      unescaped = true
    }
  }

  collector.add(matches)

  return {
    items: collector.items(),
    found: collector.found,
    truncated: collector.truncated,
    skipped: 0,
    unescaped,
    stopped: false,
  }
}

function describe(info: SvgInfo, bytes: number) {
  const size = info.width && info.height ? `${info.width}×${info.height}` : null
  return [size, info.viewBox && `viewBox ${info.viewBox}`, formatBytes(bytes)].filter(Boolean).join(' · ')
}
