import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { Display, Page } from "@/components/ui/page";
import { ARTICLES } from "@/kunskap/artiklar";

// Kunskap: listan över texterna (src/kunskap/artiklar.ts).
export const Route = createFileRoute("/app/kunskap/")({
  component: KnowledgeList,
});

function KnowledgeList() {
  return (
    <Page className="gap-6 pt-6">
      <header>
        <Display>Kunskap</Display>
      </header>
      <ul className="flex flex-col gap-3">
        {ARTICLES.map((a) => (
          <li key={a.slug}>
            <Link
              to="/app/kunskap/$artikel"
              params={{ artikel: a.slug }}
              className="pressable flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35"
            >
              <span className="min-w-0">
                <span className="block font-medium text-balance">{a.title}</span>
                <span className="block text-sm text-muted-foreground">{a.lede}</span>
              </span>
              <ChevronRight className="size-5 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </Page>
  );
}
