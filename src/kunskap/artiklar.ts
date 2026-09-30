import { GUIDE, PHOTO_ORDER, PHOTO_SPECS } from "@/kamera/fotoguide";

// Kunskap (ritning v2, 4.2): texter som går att läsa när som helst. Här
// står bara det som redan har sitt innehåll -- fotoguiden och hur en
// kontroll går till. Hudtypsguiden, UV och "annat på huden" kommer i 3.8.
// Ingen text lovar upptäckt eller trygghet, och ordet "AI" finns inte
// (regel 3).

export type ArticleSection = {
  heading: string | null;
  intro: string | null;
  /** Visas som en numrerad lista, som guiden i kameran. */
  items: { title: string; text: string }[];
};

export type Article = {
  slug: string;
  title: string;
  lede: string;
  sections: ArticleSection[];
};

export const ARTICLES: Article[] = [
  {
    slug: "bra-bilder",
    title: "Så tar du bra bilder",
    lede: "Hudläkaren bedömer fläcken utifrån dina foton. Det här gör dem lättare att bedöma.",
    sections: [
      {
        heading: "Tre foton",
        intro: "Närbilden behövs. Översikten och skalan hjälper hudläkaren att se sammanhang och storlek.",
        items: PHOTO_ORDER.map((kind) => ({ title: PHOTO_SPECS[kind].title, text: PHOTO_SPECS[kind].instruction })),
      },
      {
        heading: "Innan du fotograferar",
        intro: null,
        items: GUIDE,
      },
    ],
  },
  {
    slug: "sa-gar-det-till",
    title: "Så går en kontroll till",
    lede: "Från foto till svar i fyra steg.",
    sections: [
      {
        heading: null,
        intro: null,
        items: [
          {
            title: "Du fotograferar",
            text: "Du visar var fläcken sitter på figuren, tar tre foton och svarar på några frågor om fläcken.",
          },
          {
            title: "Kontrollen läggs i en kö",
            text: "Kön visar bara kroppsdel och väntetid.",
          },
          {
            title: "En hudläkare tar ärendet",
            text: "Först då ser hudläkaren dina foton, dina svar om fläcken och din hudhistorik.",
          },
          {
            title: "Du får svaret som ett brev",
            text: "Brevet kommer här i appen, med hudläkarens namn. Tills dess ser du hur lång tid det är kvar. Räcker inte bilderna står det vad som behövs.",
          },
        ],
      },
    ],
  },
];

export function articleBySlug(slug: string): Article | null {
  return ARTICLES.find((a) => a.slug === slug) ?? null;
}
