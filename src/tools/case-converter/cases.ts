export interface CaseVariant {
  id: string
  label: string
  hint: string
  convert: (input: string) => string
}

export const CASE_VARIANTS: CaseVariant[] = [
  {
    id: 'upper',
    label: 'UPPERCASE',
    hint: 'все буквы заглавные',
    convert: (input) => input.toLocaleUpperCase(),
  },
  {
    id: 'lower',
    label: 'lowercase',
    hint: 'все буквы строчные',
    convert: (input) => input.toLocaleLowerCase(),
  },
  {
    id: 'title',
    label: 'Title Case',
    hint: 'каждое слово с заглавной',
    convert: (input) => input.replace(/\p{L}[\p{L}\p{N}'’]*/gu, capitalize),
  },
  {
    id: 'sentence',
    label: 'Sentence case',
    hint: 'заглавная в начале предложения',
    convert: (input) =>
      input
        .toLocaleLowerCase()
        .replace(
          /(^|[.!?…]\s+|\n\s*)(\p{L})/gu,
          (_, prefix: string, letter: string) => prefix + letter.toLocaleUpperCase(),
        ),
  },
  {
    id: 'camel',
    label: 'camelCase',
    hint: 'переменные в JS',
    convert: perLine((words) =>
      words.map((word, index) => (index === 0 ? word.toLocaleLowerCase() : capitalize(word))).join(''),
    ),
  },
  {
    id: 'pascal',
    label: 'PascalCase',
    hint: 'классы и компоненты',
    convert: perLine((words) => words.map(capitalize).join('')),
  },
  {
    id: 'snake',
    label: 'snake_case',
    hint: 'Python, SQL',
    convert: perLine((words) => words.map(lower).join('_')),
  },
  {
    id: 'constant',
    label: 'CONSTANT_CASE',
    hint: 'константы, переменные окружения',
    convert: perLine((words) => words.map((word) => word.toLocaleUpperCase()).join('_')),
  },
  {
    id: 'kebab',
    label: 'kebab-case',
    hint: 'CSS-классы, URL',
    convert: perLine((words) => words.map(lower).join('-')),
  },
  {
    id: 'dot',
    label: 'dot.case',
    hint: 'ключи конфигов',
    convert: perLine((words) => words.map(lower).join('.')),
  },
  {
    id: 'invert',
    label: 'iNVERTED cASE',
    hint: 'регистр каждой буквы наоборот',
    convert: (input) =>
      [...input]
        .map((char) => {
          const upper = char.toLocaleUpperCase()
          return char === upper ? char.toLocaleLowerCase() : upper
        })
        .join(''),
  },
]

/** Разбивает строку на слова, понимая camelCase, snake_case, дефисы и пробелы. */
export function splitWords(line: string): string[] {
  return line
    .replace(/(\p{Ll}|\p{N})(\p{Lu})/gu, '$1 $2')
    .replace(/(\p{Lu}+)(\p{Lu}\p{Ll})/gu, '$1 $2')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
}

/** Нотации применяются к каждой строке отдельно, чтобы список из строк не склеился в одну. */
function perLine(join: (words: string[]) => string) {
  return (input: string) =>
    input
      .split('\n')
      .map((line) => join(splitWords(line)))
      .join('\n')
}

function capitalize(word: string) {
  const [first, ...rest] = [...word]
  return first === undefined ? '' : first.toLocaleUpperCase() + rest.join('').toLocaleLowerCase()
}

function lower(word: string) {
  return word.toLocaleLowerCase()
}

export function countWords(input: string) {
  return splitWords(input.replaceAll('\n', ' ')).length
}
