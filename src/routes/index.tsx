import { createFileRoute, Navigate } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: IndexComponent,
});

function IndexComponent() {
  // O 'replace' é crucial aqui: ele substitui a rota atual no histórico.
  // Assim, se o usuário clicar em "Voltar" no sbXPAY, ele não cai num loop infinito.
  return <Navigate to="/sbxpay" replace />;
}