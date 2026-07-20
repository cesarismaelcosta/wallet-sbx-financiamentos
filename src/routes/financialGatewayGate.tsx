import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/financialGatewayGate')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/financialGatewayGate"!</div>
}
