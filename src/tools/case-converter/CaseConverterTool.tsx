import { useMemo, useState } from 'react'
import { Button, Callout, CopyButton, Field, Stats, TextArea } from '../../components/ui.tsx'
import { CASE_VARIANTS, countWords } from './cases.ts'
import './CaseConverterTool.css'

export default function CaseConverterTool() {
  const [input, setInput] = useState('')

  const results = useMemo(
    () => CASE_VARIANTS.map((variant) => ({ variant, output: variant.convert(input) })),
    [input],
  )

  return (
    <div className="tool-body">
      <Field
        label="Исходный текст"
        action={
          <Button variant="ghost" className="btn--compact" disabled={!input} onClick={() => setInput('')}>
            Очистить
          </Button>
        }
        hint="Многострочный текст обрабатывается построчно, так что список названий останется списком."
      >
        <TextArea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="user profile settings"
          className="case-input"
        />
      </Field>

      {input ? (
        <>
          <Stats
            items={[
              { label: 'Символов', value: [...input].length },
              { label: 'Слов', value: countWords(input) },
              { label: 'Строк', value: input.split('\n').length },
            ]}
          />

          <div className="variants">
            {results.map(({ variant, output }) => (
              <div key={variant.id} className="variant">
                <div className="variant__head">
                  <div>
                    <h3>{variant.label}</h3>
                    <p className="variant__hint">{variant.hint}</p>
                  </div>
                  <div className="variant__actions">
                    <Button
                      variant="ghost"
                      className="btn--compact"
                      title="Подставить результат в поле ввода"
                      onClick={() => setInput(output)}
                    >
                      В ввод
                    </Button>
                    <CopyButton value={output} />
                  </div>
                </div>
                <pre className="variant__output">{output || '—'}</pre>
              </div>
            ))}
          </div>
        </>
      ) : (
        <Callout>Введите текст — все варианты посчитаются сразу.</Callout>
      )}
    </div>
  )
}
