import { createLazyFileRoute } from '@tanstack/react-router';

export const Route = createLazyFileRoute('/sandbox/offer_new')({
  component: () => <div>Sandbox Carregado</div>,
});