import { Link } from 'react-router-dom'
import { CATEGORIES, TOOLS, toolsByCategory } from '../tools/registry.ts'
import './HomePage.css'

export default function HomePage() {
  const groups = toolsByCategory()

  return (
    <div className="home">
      <header className="home__hero">
        <h1>Инструменты для программирования</h1>
        <p>
          Небольшие утилиты, которых обычно не хватает под рукой: конвертация форматов, разбор строк,
          сравнение текста. Всё работает прямо в браузере — данные никуда не отправляются.
        </p>
      </header>

      {groups.map((group) => (
        <section key={group.category} className="home__section">
          <h2>{group.label}</h2>
          <div className="cards">
            {group.tools.map((tool) => (
              <Link key={tool.slug} to={`/tools/${tool.slug}`} className="card">
                <h3>{tool.title}</h3>
                <p>{tool.description}</p>
                <span className="card__category">{CATEGORIES[tool.category]}</span>
              </Link>
            ))}
          </div>
        </section>
      ))}

      <p className="home__note">
        Инструментов сейчас: {TOOLS.length}. Как добавить свой — описано в <code>README.md</code>.
      </p>
    </div>
  )
}
