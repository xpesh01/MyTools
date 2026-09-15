# MyTools

Заготовка сайта с небольшими инструментами для программирования. Всё работает в браузере,
без бэкенда: данные не покидают вкладку.

Стек: Vite + React + TypeScript, роутинг на `react-router-dom`, стили — обычный CSS с переменными.

## Запуск

```bash
npm install
npm run dev      # локальный сервер
npm run build    # проверка типов + сборка в dist/
npm run preview  # посмотреть собранную версию
npm run lint     # oxlint
```

## Что уже есть

| Инструмент | Путь | Что делает |
| --- | --- | --- |
| Base64 ↔ изображение | `/tools/base64-image` | Файл в data URL и обратно, превью, скачивание, сниппеты HTML/CSS |
| Сравнение текста | `/tools/text-diff` | Посимвольный diff с подсветкой и позицией первого различия |
| Регистр и нотации | `/tools/case-converter` | UPPERCASE, camelCase, snake_case, kebab-case и другие |

## Структура

```
src/
  main.tsx                  точка входа, HashRouter
  App.tsx                   роуты: / и /tools/:slug
  index.css                 переменные темы и базовые стили
  components/
    Layout.tsx              сайдбар с поиском, мобильное меню, контейнер контента
    ui.tsx                  общие элементы: Button, Field, TextArea, Stats и т. д.
  pages/
    HomePage.tsx            каталог инструментов
    ToolPage.tsx            обёртка страницы инструмента (заголовок + Suspense)
    NotFoundPage.tsx
  hooks/useClipboard.ts     копирование с индикатором «Скопировано»
  lib/cx.ts                 склейка CSS-классов
  tools/
    registry.ts             ЕДИНЫЙ список инструментов
    <slug>/                 по папке на инструмент
```

## Как добавить инструмент

Нужны два шага: компонент и одна строка в реестре. Роут, ссылка в меню, карточка на главной
и поиск подхватятся сами.

### 1. Компонент

Создайте `src/tools/json-format/JsonFormatTool.tsx` с экспортом по умолчанию:

```tsx
import { useState } from 'react'
import { Field, TextArea, CopyButton } from '../../components/ui.tsx'

export default function JsonFormatTool() {
  const [input, setInput] = useState('')

  return (
    <div className="tool-body">
      <div className="tool-panels">
        <Field label="Вход">
          <TextArea value={input} onChange={(event) => setInput(event.target.value)} />
        </Field>
        <Field label="Результат" action={<CopyButton value={input} />}>
          <TextArea value={input} readOnly />
        </Field>
      </div>
    </div>
  )
}
```

Полезные классы раскладки: `tool-body` (вертикальная колонка с отступами) и `tool-panels`
(адаптивная сетка «вход — выход»).

Заголовок, описание и категорию рисует `ToolPage`, внутри компонента их дублировать не нужно.

### 2. Запись в реестре

В `src/tools/registry.ts` добавьте элемент в массив `TOOLS`:

```ts
{
  slug: 'json-format',
  title: 'Форматирование JSON',
  description: 'Красивый отступ, компактный вид и проверка синтаксиса.',
  category: 'data',
  keywords: ['json', 'prettify', 'валидация'],
  Component: lazy(() => import('./json-format/JsonFormatTool.tsx')),
}
```

`lazy` важен: каждый инструмент попадает в свой чанк и не утяжеляет первую загрузку.
Новую категорию, если нужно, добавьте в `CATEGORIES` там же.

### Соглашения

- Нетривиальную логику держите в отдельном файле рядом с компонентом (`base64.ts`, `diff.ts`,
  `cases.ts`). Так её проще проверять и переиспользовать, а компонент остаётся про интерфейс.
- Стили инструмента — в `<Имя>.css` рядом с компонентом, цвета берите из переменных `index.css`.
- Тяжёлые вычисления оборачивайте в `useMemo`, а для больших текстовых полей пригодится
  `useDeferredValue` (пример — `TextDiffTool.tsx`).

## Деплой

`npm run build` кладёт статику в `dist/` — её можно отдать с любого хостинга. Используется
`HashRouter`, поэтому ссылки вида `/#/tools/text-diff` работают без настройки сервера.
Если хочется URL без `#`, замените в `src/main.tsx` `HashRouter` на `BrowserRouter` и настройте
на хостинге отдачу `index.html` для всех путей.
