import { createLazyFileRoute } from "@tanstack/react-router";
import { Bell, Building2, KeyRound, Percent, Users, Webhook } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

export const Route = createLazyFileRoute("/backoffice/configs")({
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
        <h1 className="page-header-title">Configurações</h1>
        <p className="text-sm text-neutral-600">
          Ajuste preferências da sua operação de crédito.
        </p>
      </div>

      {/* Notificações em destaque */}
      <div className="rounded-none border border-neutral-200 bg-white p-6 shadow-xs">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-none bg-neutral-100 text-neutral-900 border border-neutral-200 shrink-0">
            <Bell className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h2 className="text-base font-bold text-neutral-900">Notificações</h2>
            <p className="text-sm text-neutral-600">
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
                  className="flex items-center justify-between rounded-none border border-neutral-200 px-4 py-3 bg-neutral-50/50"
                >
                  <span className="text-sm font-medium text-neutral-900">{n.l}</span>
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
              className="rounded-none border border-neutral-200 bg-white p-6 transition-all hover:-translate-y-0.5 hover:border-neutral-900 shadow-xs flex flex-col"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-none bg-neutral-100 text-neutral-900 border border-neutral-200 shrink-0">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-base font-bold text-neutral-900">{s.title}</h3>
              <p className="mt-1 text-sm text-neutral-600 flex-1">{s.desc}</p>
              <Button size="sm" variant="outline" className="mt-4 rounded-none border-neutral-200 text-neutral-900 font-bold shadow-xs w-full sm:w-auto self-start hover:bg-primary hover:text-primary-foreground hover:border-primary">
                Configurar
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}