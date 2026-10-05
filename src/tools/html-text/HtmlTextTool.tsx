import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import {
  Button,
  Callout,
  CopyButton,
  Field,
  Input,
  SegmentedControl,
  Stats,
  TextArea,
  Toolbar,
} from '../../components/ui.tsx'
import { cx } from '../../lib/cx.ts'
import { formatBytes } from '../../lib/format.ts'
import { extractContent } from './extractContent.ts'
import { fetchPage } from './fetchPage.ts'
import './HtmlTextTool.css'

type Scope = 'main' | 'whole'

/** Страницы тяжелее этого браузер разбирает уже заметно дольше секунды. */
const MAX_FILE_SIZE = 25 * 1024 * 1024

const FILE_TYPES = '.html,.htm,.xhtml,.txt,text/html'

export default function HtmlTextTool() {
  const [url, setUrl] = useState('')
  const [input, setInput] = useState('')
  const [page, setPage] = useState<{ html: string; label: string; via?: 'direct' | 'proxy' } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [scope, setScope] = useState<Scope>('main')
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const loadRef = useRef<AbortController | null>(null)

  useEffect(() => () => loadRef.current?.abort(), [])

  const deferredInput = useDeferredValue(input)
  const source = page ? page.html : deferredInput

  const result = useMemo(
    () => (source.trim() ? extractContent(source, { whole: scope === 'whole' }) : null),
    [source, scope],
  )

  async function loadUrl() {
    loadRef.current?.abort()
    const controller = new AbortController()
    loadRef.current = controller

    setError('')
    setLoading(true)
    setPage(null)
    setInput('')

    try {
      const loaded = await fetchPage(url, controller.signal)
      if (loadRef.current !== controller) return
      setPage({ html: loaded.html, label: loaded.url, via: loaded.via })
    } catch (loadError) {
      if (loadRef.current !== controller) return
      setError(controller.signal.aborted ? 'Загрузка отменена.' : (loadError as Error).message)
    } finally {
      if (loadRef.current === controller) {
        loadRef.current = null
        setLoading(false)
      }
    }
  }

  async function loadFile(files: FileList | null) {
    const file = files?.[0]
    if (!file) return

    if (file.size > MAX_FILE_SIZE) {
      setError(`«${file.name}» весит ${formatBytes(file.size)} — это больше ${formatBytes(MAX_FILE_SIZE)}.`)
      return
    }

    try {
      const html = await file.text()
      setError('')
      setInput('')
      setPage({ html, label: file.name })
    } catch {
      setError('Не удалось прочитать файл.')
    }
  }

  function reset() {
    loadRef.current?.abort()
    loadRef.current = null
    setUrl('')
    setInput('')
    setPage(null)
    setError('')
    setLoading(false)
  }

  function download() {
    if (!result) return

    const blob = new Blob([result.markdown], { type: 'text/markdown;charset=utf-8' })
    const href = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = href
    link.download = fileNameFor(result.title)
    link.click()
    URL.revokeObjectURL(href)
  }

  return (
    <div className="tool-body">
      <Field
        label="Ссылка на страницу"
        hint="Браузер сначала пробует скачать страницу сам. Большинство сайтов это запрещают — тогда запрос идёт через r.jina.ai, которому уходит только адрес."
      >
        <form
          className="url-row"
          onSubmit={(event) => {
            event.preventDefault()
            void loadUrl()
          }}
        >
          <Input
            type="url"
            inputMode="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://example.com/article"
          />
          <Button variant="primary" disabled={!url.trim() || loading} onClick={() => void loadUrl()}>
            {loading ? 'Загружаем…' : 'Загрузить'}
          </Button>
          {loading && (
            <Button variant="ghost" onClick={() => loadRef.current?.abort()}>
              Отмена
            </Button>
          )}
        </form>
      </Field>

      <Field
        label="Или HTML страницы"
        action={
          <Toolbar>
            <Button variant="ghost" className="btn--compact" onClick={() => fileInputRef.current?.click()}>
              Открыть файл
            </Button>
            <Button
              variant="ghost"
              className="btn--compact"
              disabled={!input && !page && !url}
              onClick={reset}
            >
              Очистить
            </Button>
          </Toolbar>
        }
        hint="Подойдёт исходник страницы из «Просмотр кода» или сохранённый .html. Разбор идёт во вкладке: скрипты не выполняются, картинки не загружаются."
      >
        <div
          className={cx('drop-area', dragging && 'drop-area--active')}
          onDragOver={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false)
          }}
          onDrop={(event) => {
            event.preventDefault()
            setDragging(false)
            void loadFile(event.dataTransfer.files)
          }}
        >
          {page ? (
            <div className="page-panel">
              <p className="page-panel__source">{page.label}</p>
              <p className="page-panel__meta">
                {count(page.html.length)} символов разметки
                {page.via === 'proxy' && ' · получено через r.jina.ai'}
                {page.via === 'direct' && ' · скачано напрямую'}
                {' · чтобы вернуться к вставке, нажмите «Очистить»'}
              </p>
            </div>
          ) : (
            <TextArea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={'<!doctype html>\n<html>…'}
            />
          )}
          {dragging && <p className="drop-area__overlay">Отпустите файл — из него заберётся текст</p>}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept={FILE_TYPES}
          hidden
          onChange={(event) => {
            void loadFile(event.target.files)
            event.target.value = ''
          }}
        />

        {error && <Callout tone="error">{error}</Callout>}
      </Field>

      {!source.trim() && !loading && (
        <Callout>
          Вставьте HTML, перетащите файл или укажите ссылку — получится чистый текст в Markdown:
          заголовки, списки и таблицы на месте, скрипты, меню и иконки убраны.
        </Callout>
      )}

      {result && result.markdown.length === 0 && (
        <Callout tone="error">
          Текста не нашлось. Возможно, страница рисуется скриптами — тогда сохраните её из браузера
          целиком и загрузите файлом.
        </Callout>
      )}

      {result && result.markdown.length > 0 && (
        <>
          <Stats
            items={[
              { label: 'Было символов', value: count(result.stats.sourceChars) },
              { label: 'Стало', value: count(result.stats.chars) },
              { label: 'Выброшено', value: `${share(result.stats.chars, result.stats.sourceChars)}%` },
              { label: 'Слов', value: count(result.stats.words) },
              { label: 'Токенов, ≈', value: count(result.stats.tokens) },
              ...(result.stats.headings > 0 ? [{ label: 'Заголовков', value: result.stats.headings }] : []),
              ...(result.stats.tables > 0 ? [{ label: 'Таблиц', value: result.stats.tables }] : []),
            ]}
          />

          <Field
            label="Текст в Markdown"
            action={
              <Toolbar>
                <SegmentedControl<Scope>
                  value={scope}
                  onChange={setScope}
                  label="Что брать со страницы"
                  options={[
                    { value: 'main', label: 'Только основное' },
                    { value: 'whole', label: 'Вся страница' },
                  ]}
                />
                <CopyButton value={result.markdown} />
                <Button variant="ghost" className="btn--compact" onClick={download}>
                  Скачать .md
                </Button>
              </Toolbar>
            }
            hint="Если полезное потерялось — переключитесь на «Вся страница»: там остаётся всё, кроме скриптов, стилей и картинок."
          >
            <TextArea className="markdown-output" value={result.markdown} readOnly />
          </Field>
        </>
      )}
    </div>
  )
}

function count(value: number) {
  return value.toLocaleString('ru-RU')
}

function share(part: number, whole: number) {
  if (!whole) return 0
  return Math.max(0, Math.round(100 - (part / whole) * 100))
}

/** Имя файла из заголовка страницы, иначе просто page.md */
function fileNameFor(title: string | null) {
  const slug = (title ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)

  return `${slug || 'page'}.md`
}
