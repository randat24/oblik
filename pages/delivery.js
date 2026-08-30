import Home, { DELIVERY_VIEW } from './index';

// Окрема адреса для логістики: /delivery. Решта застосунку та сама —
// доставки живуть у ньому, а не збоку, бо коробки їдуть із того ж майна.
export default function DeliveryPage() {
  return <Home startView={DELIVERY_VIEW} />;
}
