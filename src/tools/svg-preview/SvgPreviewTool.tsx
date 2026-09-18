import { useDeferredValue, useMemo, useState } from 'react'
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
  lineOf,
  suggestFileName,
  toDataUrl,
  unescapeMarkup,
  withNamespaces,
} from './extractSvg.ts'
import './SvgPreviewTool.css'

type Background = 'checker' | 'light' | 'dark'

export default function SvgPreviewTool() {
  const [input, setInput] = useState('')
  const [background, setBackground] = useState<Background>('checker')

  const deferredInput = useDeferredValue(input)

  const { items, unescaped } = useMemo(() => parse(deferredInput), [deferredInput])

  const brokenCount = items.filter((item) => item.info.error).length
  const totalBytes = items.reduce((sum, item) => sum + item.bytes, 0)

  return (
    <div className="tool-body">
      <Field
        label="Текст с SVG"
        action={
          <Button variant="ghost" className="btn--compact" disabled={!input} onClick={() => setInput('')}>
            Очистить
          </Button>
        }
        hint="Лишний текст вокруг можно не убирать. Атрибут xmlns дописывается автоматически, если его нет, а превью рисуется через <img>, поэтому скрипты внутри SVG не выполняются."
      >
        <TextArea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={'Вставьте что угодно, например:\n\nicon: <svg viewBox="0 0 24 24">…</svg>\nиз лога, JSX, JSON или вёрстки'}
        />
      </Field>

      {!input.trim() && <Callout>Вставьте текст — все найденные SVG появятся ниже.</Callout>}

      {input.trim() && items.length === 0 && (
        <Callout tone="error">
          SVG не найден: нужен открывающий тег <code>&lt;svg</code> и закрывающий <code>&lt;/svg&gt;</code>.
        </Callout>
      )}

      {items.length > 0 && (
        <>
          {unescaped && (
            <Callout>
              В исходном виде SVG не читался, поэтому разметка была разэкранирована — так бывает при
              копировании из JSON или HTML-атрибута.
            </Callout>
          )}

          <Stats
            items={[
              { label: 'Найдено', value: items.length },
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
            {items.map((item, index) => (
              <figure key={`${item.line}-${index}`} className="svg-card">
                <div className={cx('svg-canvas', `svg-canvas--${background}`)}>
                  {item.info.error ? (
                    <span className="svg-canvas__broken">не отображается</span>
                  ) : (
                    <img src={item.dataUrl} alt={item.fileName} loading="lazy" />
                  )}
                </div>

                <figcaption className="svg-card__body">
                  <div className="svg-card__head">
                    <strong className="svg-card__name">{item.fileName}</strong>
                    <span className="svg-card__line">строка {item.line}</span>
                  </div>

                  <p className="svg-card__meta">{describe(item.info, item.bytes)}</p>

                  {item.info.error && <Callout tone="error">{item.info.error}</Callout>}
                  {item.info.hasScript && (
                    <Callout>
                      Внутри есть <code>&lt;script&gt;</code> — в превью он не запускается, но перед
                      использованием файл стоит проверить.
                    </Callout>
                  )}

                  <Toolbar>
                    <a
                      className="btn btn--ghost btn--compact"
                      href={item.dataUrl}
                      download={item.fileName}
                    >
                      Скачать
                    </a>
                    <CopyButton value={item.code} label="Копировать код" />
                  </Toolbar>
                </figcaption>
              </figure>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

interface SvgItem {
  code: string
  info: SvgInfo
  line: number
  bytes: number
  fileName: string
  dataUrl: string
}

function parse(input: string): { items: SvgItem[]; unescaped: boolean } {
  let source = input
  let matches = extractSvgs(source)
  let unescaped = false

  if (matches.length === 0 && input.trim()) {
    const decoded = unescapeMarkup(input)
    const decodedMatches = extractSvgs(decoded)
    if (decodedMatches.length > 0) {
      source = decoded
      matches = decodedMatches
      unescaped = true
    }
  }

  const items = matches.map((match, index) => {
    const code = withNamespaces(match.code)
    const info = inspectSvg(code)
    return {
      code,
      info,
      line: lineOf(source, match.start),
      bytes: new TextEncoder().encode(code).length,
      fileName: suggestFileName(info, index),
      dataUrl: toDataUrl(code),
    }
  })

  return { items, unescaped }
}

function describe(info: SvgInfo, bytes: number) {
  const size = info.width && info.height ? `${info.width}×${info.height}` : null
  return [size, info.viewBox && `viewBox ${info.viewBox}`, formatBytes(bytes)].filter(Boolean).join(' · ')
}
