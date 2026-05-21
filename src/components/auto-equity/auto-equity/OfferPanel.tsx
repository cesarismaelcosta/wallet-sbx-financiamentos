import { Car, ShieldCheck, Percent, Clock } from "lucide-react";

/**
 * Coluna esquerda do card (estática, igual à referência Creditas).
 * Apresenta o produto independente do passo atual.
 */
export function OfferPanel() {
  return (
    <div className="flex flex-col gap-8">
      <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Car className="h-7 w-7" />
      </div>

      <div>
        <h1 className="text-3xl font-semibold leading-tight text-foreground sm:text-4xl">
          Use seu carro como{" "}
          <span className="text-primary">garantia</span> e libere crédito com as melhores taxas
        </h1>
        <p className="mt-4 text-base text-muted-foreground">
          Você acessa um <strong className="text-foreground">crédito</strong> com ótimas condições e{" "}
          <strong className="text-foreground">continua usando seu carro</strong>. Preencha seus
          dados para começarmos a simulação.
        </p>
      </div>

      <ul className="flex flex-col gap-4">
        <li className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Percent className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-medium text-foreground">Taxa a partir de 1,89% a.m.</p>
            <p className="text-xs text-muted-foreground">Muito mais barato que cartão e cheque</p>
          </div>
        </li>
        <li className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Clock className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-medium text-foreground">Até 60 meses para pagar</p>
            <p className="text-xs text-muted-foreground">Escolha a parcela que cabe no seu bolso</p>
          </div>
        </li>
        <li className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ShieldCheck className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-medium text-foreground">100% seguro e online</p>
            <p className="text-xs text-muted-foreground">Você continua usando seu carro normalmente</p>
          </div>
        </li>
      </ul>

      <div className="mt-auto rounded-xl border border-border bg-muted/40 p-4 text-xs text-muted-foreground">
        Em parceria com{" "}
        <strong className="text-foreground">ME Resolve Serviços Financeiros</strong> e{" "}
        <strong className="text-foreground">Creditas</strong>.
      </div>
    </div>
  );
}
