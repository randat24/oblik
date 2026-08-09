import Head from 'next/head';
import { useEffect } from 'react';
import '../styles/globals.css';

export default function App({ Component, pageProps }) {
  // Без службового робітника сторінка в полі просто не відкриється. Версію
  // збірки дописуємо в адресу: інакше браузер лишає старого воркера зі старим
  // кешем, і нові зміни не доходять, скільки сторінку не перезавантажуй.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const v = (process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || 'dev').slice(0, 7);
    navigator.serviceWorker.register('/sw.js?v=' + v).catch(() => {});
  }, []);

  return (
    <>
      <Head>
        <title>Облік майна</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#12140f" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/favicon.svg" />
        <link rel="manifest" href="/manifest.webmanifest" />
      </Head>
      <Component {...pageProps} />
    </>
  );
}
