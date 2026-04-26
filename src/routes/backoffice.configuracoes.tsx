import { createFileRoute } from "@tanstack/react-router";
import { Bell, Building2, KeyRound, Percent, Users, Webhook } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/backoffice/configuracoes")({
  component: ConfiguracoesPage,
});

const SECTIONS = [
  { icon: Building2, title: "Empresa", desc: "Razão social, CNPJ, lojas e unidades operacionais." },
  { icon: Users, title: "Usuários & Perfis", desc: "Gerencie analistas, vendedores e permissões." },
  { icon: Percent, title: "Taxas & Políticas", desc: "Configure taxas por produto, prazos e LTV máximo." },
  { icon: Webhook, title: "Integrações", desc: "Webhooks, APIs externas e parceiros financeiros." },
  { icon: KeyRound, title: "Segurança", desc: "MFA, sessões ativas e política de senhas." },
];

function ConfiguracoesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground">
          Ajuste preferências da sua operação de crédito.
        </p>
      </div>

      {/* Notificações em destaque */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Bell className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h2 className="text-base font-bold">Notificações</h2>
            <p className="text-sm text-muted-foreground">
              Escolha como deseja ser avisado sobre novas propostas e aprovações.
            </p>
            <div className="mt-5 space-y-3">
              {[
                { l: "Nova proposta recebida", on: true },
                { l: "Proposta aprovada", on: true },
                { l: "Visita agendada", on: false },
                { l: "Resumo diário por e-mail", on: true },
              ].map((n) => (
                <div
                  key={n.l}
                  className="flex items-center justify-between rounded-xl border border-border px-4 py-3"
                >
                  <span className="text-sm font-medium">{n.l}</span>
                  <Switch defaultChecked={n.on} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Demais seções */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map((s) => {
          const Icon = s.icon;
          return (
            <div
              key={s.title}
              className="rounded-2xl border border-border bg-card p-6 transition-all hover:-translate-y-0.5 hover:border-primary/40"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-base font-bold">{s.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{s.desc}</p>
              <Button size="sm" variant="outline" className="mt-4 rounded-lg">
                Configurar
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
