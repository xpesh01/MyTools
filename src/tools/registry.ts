import { lazy } from 'react'
import type { ComponentType, LazyExoticComponent } from 'react'

/**
 * Категории нужны только для группировки в меню и на главной.
 * Чтобы добавить новую — допишите её здесь.
 */
export const CATEGORIES = {
  text: 'Текст',
  encoding: 'Кодирование',
  images: 'Изображения',
  data: 'Данные',
} as const

export type ToolCategory = keyof typeof CATEGORIES

export interface Tool {
  /** Часть URL: /tools/<slug> */
  slug: string
  title: string
  /** Одна строка для карточки и подзаголовка страницы */
  description: string
  category: ToolCategory
  /** Дополнительные слова для поиска (title и description учитываются всегда) */
  keywords?: string[]
  Component: LazyExoticComponent<ComponentType>
}

export const TOOLS: Tool[] = [
  {
    slug: 'base64-image',
    title: 'Base64 ↔ изображение',
    description:
      'Файл в data URL и обратно: превью, размеры, скачивание, готовые сниппеты для HTML и CSS.',
    category: 'images',
    keywords: ['base64', 'data url', 'картинка', 'png', 'jpeg', 'декод', 'кодирование'],
    Component: lazy(() => import('./base64-image/Base64ImageTool.tsx')),
  },
  {
    slug: 'svg-preview',
    title: 'SVG из текста',
    description:
      'Вытаскивает все SVG из произвольного текста, показывает их и даёт скачать каждый файлом.',
    category: 'images',
    keywords: ['svg', 'иконки', 'превью', 'вектор', 'скачать', 'извлечь'],
    Component: lazy(() => import('./svg-preview/SvgPreviewTool.tsx')),
  },
  {
    slug: 'text-diff',
    title: 'Сравнение текста',
    description:
      'Посимвольный diff двух фрагментов с подсветкой вставок и удалений и позицией первого различия.',
    category: 'text',
    keywords: ['diff', 'сравнить', 'различия', 'символы'],
    Component: lazy(() => import('./text-diff/TextDiffTool.tsx')),
  },
  {
    slug: 'case-converter',
    title: 'Регистр и нотации',
    description:
      'UPPERCASE, lowercase, camelCase, snake_case, kebab-case и другие варианты сразу для всего текста.',
    category: 'text',
    keywords: ['регистр', 'case', 'camel', 'snake', 'kebab', 'заглавные', 'строчные'],
    Component: lazy(() => import('./case-converter/CaseConverterTool.tsx')),
  },
]

export function findTool(slug: string | undefined): Tool | undefined {
  return TOOLS.find((tool) => tool.slug === slug)
}

/** Инструменты, сгруппированные по категориям, в порядке объявления CATEGORIES. */
export function toolsByCategory(tools: Tool[] = TOOLS) {
  return (Object.keys(CATEGORIES) as ToolCategory[])
    .map((category) => ({
      category,
      label: CATEGORIES[category],
      tools: tools.filter((tool) => tool.category === category),
    }))
    .filter((group) => group.tools.length > 0)
}

export function searchTools(query: string, tools: Tool[] = TOOLS): Tool[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return tools

  return tools.filter((tool) => {
    const haystack = [tool.title, tool.description, CATEGORIES[tool.category], ...(tool.keywords ?? [])]
      .join(' ')
      .toLowerCase()
    return needle.split(/\s+/).every((word) => haystack.includes(word))
  })
}
