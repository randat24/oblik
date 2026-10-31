import Home, { ZV_VIEW } from './index';

// Окрема адреса для майна служби звʼязку: /zv. Вхід той самий, що й до
// решти застосунку, — розділ закритий, бо там серійні номери.
export default function ZvPage() {
  return <Home startView={ZV_VIEW} />;
}
