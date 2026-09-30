import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Display, Eyebrow, Lede, Page, Title } from "@/components/ui/page";
import { articleBySlug, type ArticleSection } from "@/kunskap/artiklar";

// En text ur Kunskap. En okänd adress ger appens "finns inte".
export const Route = createFileRoute("/app/kunskap/$artikel")({
  loader: ({ params }) => {
    const article = articleBySlug(params.artikel);
    if (!article) throw notFound();
    return article;
  },
  notFoundComponent: ArticleNotFound,
  component: ArticlePage,
});

function ArticlePage() {
  const article = Route.useLoaderData();
  return (
    <Page className="gap-7 pt-4">
      <nav aria-label="Tillbaka">
        <Button asChild variant="ghost" size="sm" className="-ml-3">
          <Link to="/app/kunskap">Kunskap</Link>
        </Button>
      </nav>
      <header className="flex flex-col gap-2">
        <Display>{article.title}</Display>
        <Lede className="text-base">{article.lede}</Lede>
      </header>
      {article.sections.map((section, i) => (
        <Section key={section.heading ?? i} section={section} />
      ))}
    </Page>
  );
}

function Section({ section }: { section: ArticleSection }) {
  return (
    <section className="flex flex-col gap-3" aria-label={section.heading ?? undefined}>
      {section.heading ? <Title>{section.heading}</Title> : null}
      {section.intro ? <p className="text-muted-foreground">{section.intro}</p> : null}
      <ol className="flex flex-col gap-3">
        {section.items.map((item, i) => (
          <li key={item.title} className="flex gap-3 rounded-2xl border border-border bg-card p-4">
            <span
              aria-hidden
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-medium text-secondary-foreground"
            >
              {i + 1}
            </span>
            <div>
              <p className="font-medium">{item.title}</p>
              <p className="text-sm text-muted-foreground">{item.text}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function ArticleNotFound() {
  return (
    <Page className="gap-4 pt-10">
      <Eyebrow>Kunskap</Eyebrow>
      <Display>Texten finns inte.</Display>
      <div>
        <Button asChild variant="outline">
          <Link to="/app/kunskap">Alla texter</Link>
        </Button>
      </div>
    </Page>
  );
}
