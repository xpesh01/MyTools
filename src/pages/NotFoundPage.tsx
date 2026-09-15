import { Link } from 'react-router-dom'
import './NotFoundPage.css'

export default function NotFoundPage() {
  return (
    <div className="not-found">
      <h1>Инструмент не найден</h1>
      <p>Возможно, ссылка устарела или инструмент ещё не добавлен.</p>
      <Link to="/">Вернуться к списку</Link>
    </div>
  )
}
