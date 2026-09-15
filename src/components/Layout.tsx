import { useMemo, useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { TOOLS, searchTools, toolsByCategory } from '../tools/registry.ts'
import './Layout.css'

export default function Layout() {
  const [query, setQuery] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)

  const groups = useMemo(() => toolsByCategory(searchTools(query)), [query])

  return (
    <div className="layout">
      <header className="topbar">
        <Link to="/" className="topbar__brand">
          MyTools
        </Link>
        <button
          type="button"
          className="topbar__toggle"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? 'Закрыть' : 'Инструменты'}
        </button>
      </header>

      <aside className={`sidebar${menuOpen ? ' sidebar--open' : ''}`}>
        <Link to="/" className="sidebar__brand">
          <span className="sidebar__logo">{'</>'}</span>
          <span>
            MyTools
            <small>инструменты разработчика</small>
          </span>
        </Link>

        <div className="sidebar__search">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поиск инструмента…"
            aria-label="Поиск инструмента"
          />
        </div>

        <nav className="sidebar__nav">
          {groups.map((group) => (
            <div key={group.category} className="nav-group">
              <p className="nav-group__title">{group.label}</p>
              {group.tools.map((tool) => (
                <NavLink
                  key={tool.slug}
                  to={`/tools/${tool.slug}`}
                  className={({ isActive }) => `nav-link${isActive ? ' nav-link--active' : ''}`}
                  onClick={() => setMenuOpen(false)}
                >
                  {tool.title}
                </NavLink>
              ))}
            </div>
          ))}

          {groups.length === 0 && <p className="sidebar__empty">Ничего не нашлось</p>}
        </nav>

        <div className="sidebar__footer">
          Инструментов: {TOOLS.length}
          <br />
          Всё считается локально, в браузере.
        </div>
      </aside>

      <main className="content">
        <div className="content__inner">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
