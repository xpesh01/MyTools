import { useMemo, useRef, useState } from 'react'
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
import { base64FromDataUrl, decodeBase64Image, extensionForMime } from './base64.ts'
import './Base64ImageTool.css'

type Mode = 'encode' | 'decode'

export default function Base64ImageTool() {
  const [mode, setMode] = useState<Mode>('encode')

  return (
    <div className="tool-body">
      <SegmentedControl<Mode>
        value={mode}
        onChange={setMode}
        label="Направление конвертации"
        options={[
          { value: 'encode', label: 'Изображение → base64' },
          { value: 'decode', label: 'base64 → изображение' },
        ]}
      />

      {mode === 'encode' ? <EncodePanel /> : <DecodePanel />}
    </div>
  )
}

type OutputFormat = 'dataUrl' | 'raw' | 'html' | 'css'

function EncodePanel() {
  const [file, setFile] = useState<{ name: string; size: number; type: string } | null>(null)
  const [dataUrl, setDataUrl] = useState('')
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  const [error, setError] = useState('')
  const [format, setFormat] = useState<OutputFormat>('dataUrl')
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function readFile(selected: File | undefined) {
    if (!selected) return

    setError('')
    setSize(null)

    if (!selected.type.startsWith('image/')) {
      setError(`Файл «${selected.name}» не похож на изображение.`)
      setFile(null)
      setDataUrl('')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      setFile({ name: selected.name, size: selected.size, type: selected.type })
      setDataUrl(String(reader.result))
    }
    reader.onerror = () => setError('Не удалось прочитать файл.')
    reader.readAsDataURL(selected)
  }

  const output = useMemo(() => {
    if (!dataUrl) return ''
    switch (format) {
      case 'raw':
        return base64FromDataUrl(dataUrl)
      case 'html':
        return `<img src="${dataUrl}" alt="" />`
      case 'css':
        return `background-image: url("${dataUrl}");`
      default:
        return dataUrl
    }
  }, [dataUrl, format])

  return (
    <>
      <div
        className={cx('dropzone', dragging && 'dropzone--active')}
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          readFile(event.dataTransfer.files[0])
        }}
      >
        <p>Перетащите изображение сюда</p>
        <Button variant="primary" onClick={() => inputRef.current?.click()}>
          Выбрать файл
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => readFile(event.target.files?.[0])}
        />
      </div>

      {error && <Callout tone="error">{error}</Callout>}

      {dataUrl && file && (
        <>
          <Stats
            items={[
              { label: 'Файл', value: file.name },
              { label: 'Тип', value: file.type },
              { label: 'Размер', value: formatBytes(file.size) },
              { label: 'Размеры', value: size ? `${size.width}×${size.height}` : '—' },
              { label: 'Длина base64', value: `${base64FromDataUrl(dataUrl).length} симв.` },
            ]}
          />

          <div className="tool-panels">
            <Field label="Превью">
              <div className="preview">
                <img
                  src={dataUrl}
                  alt={file.name}
                  onLoad={(event) =>
                    setSize({
                      width: event.currentTarget.naturalWidth,
                      height: event.currentTarget.naturalHeight,
                    })
                  }
                />
              </div>
            </Field>

            <Field
              label="Результат"
              action={<CopyButton value={output} />}
              hint="Большие картинки в base64 весят примерно на треть больше исходного файла."
            >
              <Toolbar>
                <SegmentedControl<OutputFormat>
                  value={format}
                  onChange={setFormat}
                  label="Формат результата"
                  options={[
                    { value: 'dataUrl', label: 'Data URL' },
                    { value: 'raw', label: 'base64' },
                    { value: 'html', label: 'HTML' },
                    { value: 'css', label: 'CSS' },
                  ]}
                />
              </Toolbar>
              <TextArea value={output} readOnly onFocus={(event) => event.currentTarget.select()} />
            </Field>
          </div>
        </>
      )}
    </>
  )
}

function DecodePanel() {
  const [input, setInput] = useState('')
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  const [broken, setBroken] = useState(false)

  const result = useMemo(() => decodeBase64Image(input), [input])
  const image = result.ok ? result.image : null

  function updateInput(value: string) {
    setInput(value)
    setSize(null)
    setBroken(false)
  }

  return (
    <div className="tool-panels">
      <Field
        label="base64 или data URL"
        action={
          <Button variant="ghost" className="btn--compact" disabled={!input} onClick={() => updateInput('')}>
            Очистить
          </Button>
        }
        hint="Переносы строк, пробелы и url-safe алфавит обрабатываются автоматически."
      >
        <TextArea
          value={input}
          onChange={(event) => updateInput(event.target.value)}
          placeholder="iVBORw0KGgoAAAANSUhEUg… или data:image/png;base64,…"
        />
      </Field>

      <Field
        label="Изображение"
        action={
          image && (
            <a
              className="btn btn--ghost btn--compact"
              href={image.dataUrl}
              download={`image.${extensionForMime(image.mime)}`}
            >
              Скачать
            </a>
          )
        }
      >
        {!result.ok && result.error && <Callout tone="error">{result.error}</Callout>}

        {!input.trim() && <Callout>Вставьте строку — превью появится автоматически.</Callout>}

        {broken && (
          <Callout tone="error">
            Данные декодировались, но браузер не смог отрисовать картинку — скорее всего, строка обрезана.
          </Callout>
        )}

        {image && (
          <>
            <div className="preview">
              <img
                src={image.dataUrl}
                alt="Декодированное изображение"
                onError={() => setBroken(true)}
                onLoad={(event) => {
                  setBroken(false)
                  setSize({
                    width: event.currentTarget.naturalWidth,
                    height: event.currentTarget.naturalHeight,
                  })
                }}
              />
            </div>
            <Stats
              items={[
                { label: 'Формат', value: image.mime },
                { label: 'Размер', value: formatBytes(image.bytes) },
                { label: 'Размеры', value: size ? `${size.width}×${size.height}` : '—' },
              ]}
            />
          </>
        )}
      </Field>
    </div>
  )
}
