import { useDeferredValue, useMemo, useState } from 'react'
import { Button, Callout, Checkbox, Field, Stats, TextArea, Toolbar } from '../../components/ui.tsx'
import { diffChars, revealWhitespace } from './diff.ts'
import './TextDiffTool.css'

export default function TextDiffTool() {
  const [left, setLeft] = useState('')
  const [right, setRight] = useState('')
  const [ignoreCase, setIgnoreCase] = useState(false)
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false)
  const [showWhitespace, setShowWhitespace] = useState(true)

  // Ввод не подтормаживает, даже если diff считается несколько десятков миллисекунд
  const deferredLeft = useDeferredValue(left)
  const deferredRight = useDeferredValue(right)

  const result = useMemo(() => {
    const options = { ignoreCase, ignoreWhitespace }
    return diffChars(normalize(deferredLeft, options), normalize(deferredRight, options))
  }, [deferredLeft, deferredRight, ignoreCase, ignoreWhitespace])

  const hasInput = Boolean(left.trim() || right.trim())
  const identical = result.firstDifference === null

  return (
    <div className="tool-body">
      <div className="tool-panels">
        <Field label="Текст 1" hint={`${[...left].length} симв., строк: ${countLines(left)}`}>
          <TextArea
            value={left}
            onChange={(event) => setLeft(event.target.value)}
            placeholder="Вставьте первый текст"
          />
        </Field>
        <Field label="Текст 2" hint={`${[...right].length} симв., строк: ${countLines(right)}`}>
          <TextArea
            value={right}
            onChange={(event) => setRight(event.target.value)}
            placeholder="Вставьте второй текст"
          />
        </Field>
      </div>

      <Toolbar>
        <Checkbox label="Игнорировать регистр" checked={ignoreCase} onChange={setIgnoreCase} />
        <Checkbox
          label="Игнорировать лишние пробелы"
          checked={ignoreWhitespace}
          onChange={setIgnoreWhitespace}
        />
        <Checkbox label="Показывать пробелы" checked={showWhitespace} onChange={setShowWhitespace} />
        <Button
          onClick={() => {
            setLeft(right)
            setRight(left)
          }}
          disabled={!hasInput}
        >
          Поменять местами
        </Button>
        <Button
          onClick={() => {
            setLeft('')
            setRight('')
          }}
          disabled={!hasInput}
        >
          Очистить
        </Button>
      </Toolbar>

      {!hasInput && <Callout>Заполните оба поля — различия подсветятся автоматически.</Callout>}

      {hasInput && (
        <>
          <Stats
            items={[
              { label: 'Добавлено', value: `+${result.added}` },
              { label: 'Удалено', value: `−${result.removed}` },
              {
                label: 'Первое различие',
                value: identical ? 'нет' : `символ ${result.firstDifference! + 1}`,
              },
            ]}
          />

          {identical ? (
            <Callout tone="success">Тексты полностью совпадают.</Callout>
          ) : (
            <Field
              label="Различия"
              hint={
                <>
                  <span className="legend legend--delete">удалено</span>
                  <span className="legend legend--insert">добавлено</span>
                </>
              }
            >
              {result.approximate && (
                <Callout>
                  Тексты слишком большие для посимвольного сравнения — показаны целиком как один
                  удалённый и один добавленный блок.
                </Callout>
              )}
              <div className="diff">
                {result.chunks.map((chunk, index) => (
                  <span key={index} className={`diff__chunk diff__chunk--${chunk.op}`}>
                    {chunk.op === 'equal' || !showWhitespace ? chunk.text : revealWhitespace(chunk.text)}
                  </span>
                ))}
              </div>
            </Field>
          )}
        </>
      )}
    </div>
  )
}

function normalize(value: string, options: { ignoreCase: boolean; ignoreWhitespace: boolean }) {
  let result = value.replaceAll('\r\n', '\n')

  if (options.ignoreWhitespace) {
    result = result
      .split('\n')
      .map((line) => line.trim().replace(/[ \t]+/g, ' '))
      .join('\n')
  }

  return options.ignoreCase ? result.toLowerCase() : result
}

function countLines(value: string) {
  return value ? value.split('\n').length : 0
}
