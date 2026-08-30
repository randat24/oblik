import Home, { STOCK_VIEW } from './index';

// Окрема адреса для складу Рибаківки: /rybakivka, а /rybakivka?id=Р-004 —
// одразу конкретна позиція. Решта застосунку та сама, лише інша стартова вкладка.
export default function RybakivkaPage() {
  return <Home startView={STOCK_VIEW} />;
}
