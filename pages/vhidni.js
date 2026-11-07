import Home, { INBOX_VIEW } from './index';

// Окрема адреса для вхідних із Signal: /vhidni. Вхід той самий, що й до решти
// застосунку, — там текст із закритої групи.
export default function InboxPage() {
  return <Home startView={INBOX_VIEW} />;
}
