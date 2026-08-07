import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/accounts/signin')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/accounts/sigin"!</div>
}
