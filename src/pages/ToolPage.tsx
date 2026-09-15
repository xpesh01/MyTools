import { Suspense, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CATEGORIES, findTool } from '../tools/registry.ts'
import NotFoundPage from './NotFoundPage.tsx'
import './ToolPage.css'

export default function ToolPage() {
  const { slug } = useParams()
  const tool = findTool(slug)

  useEffect(() => {
    document.title = tool ? `${tool.title} — MyTools` : 'MyTools'
  }, [tool])

  if (!tool) return <NotFoundPage />

  const { Component } = tool

  return (
    <article className="tool">
      <header className="tool__header">
        <Link to="/" className="tool__back">
          ← Все инструменты
        </Link>
        <h1>{tool.title}</h1>
        <p className="tool__description">{tool.description}</p>
        <span className="tool__category">{CATEGORIES[tool.category]}</span>
      </header>

      <Suspense fallback={<p className="tool__loading">Загрузка…</p>}>
        {/* key сбрасывает состояние инструмента при переходе между ними */}
        <Component key={tool.slug} />
      </Suspense>
    </article>
  )
}
