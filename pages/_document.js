import { Html, Head, Main, NextScript } from 'next/document';

/**
 * Мова документа. Без `lang` екранний читач читає український текст
 * англійською вимовою, а браузер пропонує «перекласти сторінку»; перевірка
 * доступності (axe) вважає це серйозною помилкою на кожній сторінці.
 */
export default function Document() {
  return (
    <Html lang="uk">
      <Head />
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
