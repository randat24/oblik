import { Component } from 'react';

/**
 * Перехоплювач збоїв показу.
 *
 * Без нього будь-яка помилка в розмітці залишає білий екран без жодного
 * пояснення: людина в полі не знає, чи зникли її записи, і тисне все
 * підряд. Тут вона бачить головне: записи в таблиці цілі (ламається показ,
 * а не запис) і що робити далі.
 *
 * Помилки в обробниках кліків сюди не потрапляють — вони йдуть у звичайні
 * сповіщення про невдалий запис. Тут лише те, що впало під час побудови
 * екрана.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    // у консоль, щоб розробник побачив причину, коли людина перешле скріншот
    console.error('Збій показу:', error, info?.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="err-screen" role="alert">
        <div className="err-card">
          <b className="err-title">Щось пішло не так</b>
          <p>
            Зламався показ сторінки, але записи в таблиці цілі: з даними нічого не сталося.
            Оновіть сторінку. Якщо повториться — напишіть, що ви робили перед цим.
          </p>
          <div className="err-act">
            <button type="button" className="btn" onClick={() => window.location.reload()}>Оновити сторінку</button>
            <a className="err-link" href="/">На головну</a>
          </div>
        </div>
      </main>
    );
  }
}
