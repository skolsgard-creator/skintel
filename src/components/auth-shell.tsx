import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Wordmark } from "@/components/brand/logo";
import { Display, Lede, Page } from "@/components/ui/page";

// Skalet runt inloggning, inbjudan och tvåfaktor: ordmärket, en rubrik, en
// kort ingress och formuläret. Lugnt och smalt; ingen navigation, inga
// distraktioner -- man är här för att komma in.
export function AuthShell({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Page className="min-h-dvh gap-6 pt-10">
      <Link
        to="/"
        className="inline-flex w-fit rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35"
      >
        <Wordmark height="1.6rem" />
      </Link>
      <header className="flex flex-col gap-2 pt-4">
        <Display>{title}</Display>
        {intro ? <Lede className="text-base">{intro}</Lede> : null}
      </header>
      {children}
    </Page>
  );
}
