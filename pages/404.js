import Head from 'next/head';

/** Своя сторінка 404: стандартна англійська лишала людину без виходу */
export default function NotFound() {
  return (
    <>
      <Head><title>Сторінку не знайдено</title></Head>
      <main className="err-screen">
        <div className="err-card">
          <b className="err-title">Сторінку не знайдено</b>
          <p>Такої адреси немає. Можливо, посилання застаріло або в ньому помилка.</p>
          <div className="err-act">
            <a className="btn" href="/">До обліку майна</a>
            <a className="err-link" href="/fond">Спільний фонд</a>
          </div>
        </div>
      </main>
    </>
  );
}
