// Arbetaren som tömmer notis-outboxen.
//
// Projektets andra edge-funktion, och den som gjorde valet i `bildlank` till
// mer än en funktion: när dörren väl låg här fanns det någonstans för det här
// att bo.
//
// Anropas av pg_cron via pg_net en gång i minuten (migration 20260906230000).
// Den är avsiktligt dum: den plockar rader, skickar, och rapporterar utfallet
// tillbaka. All beslutslogik -- vem som ska ha mejlet, när ett försök ska tas
// om, när det ska ges upp -- ligger i databasen.
//
//
// VARFÖR DEN INTE SKYDDAS AV verify_jwt
//
// Anroparen är pg_cron, inte en användare. Alternativet vore att lägga
// service-role-nyckeln i cron-jobbets definition, där den blir läsbar för
// alla som kan läsa cron.job. En läckt arbetarhemlighet låter någon trigga
// utskick i förtid; en läckt service-role-nyckel är hela databasen. Därför en
// egen hemlighet, och verify_jwt = false i config.toml.
//
//
// EXAKT SAMMA TEXT SOM FÖRUT
//
// Mejltexterna nedan är ordagrant flyttade från sendCaseReceivedEmail och
// sendVerdictReadyEmail i src/lib/notifications.server.ts. Ingenting är
// omformulerat. Läs integritetsnoten i den filen innan du ändrar ett ord:
// mejlen får aldrig innehålla hälsouppgifter eller antyda ett utfall, inte
// ens i ämnesraden, eftersom adressen ofta är en jobbadress arbetsgivaren
// lämnat.
//
// 'insufficient_images' har INGEN godkänd text. Den markeras 'blocked' och
// blir liggande synlig i outboxen tills någon skriver den. Att hitta på en
// formulering själv vore att skriva medicinsk copy.

// Resend direkt, inte längre via Lovables connector-gateway (bytet gjordes
// 2026-09-07). Gatewayen var en ren vidarebefordran: samma body skickades
// vidare och bara autentiseringen byttes ut. from-adressen har ALLTID satts av
// den här koden, inte av gatewayen -- avsändaren ändras alltså inte av bytet.
const RESEND_URL = "https://api.resend.com/emails";

/** MÅSTE vara en verifierad avsändardomän i DET Resend-konto vars nyckel står
 * i RESEND_API_KEY. Med gatewayen låg domänverifieringen i Lovables konto; nu
 * ligger den i vårt. Är skintel.se inte verifierad där svarar Resend 403 och
 * varje notis hamnar som failed i outboxen. Se KNOWN_ISSUES.md. */
const FROM = "Skintel <no-reply@skintel.se>";

/** Resends standardgräns är 2 anrop per sekund. Gatewayen låg emellan och
 * absorberade det; nu träffar vi begränsaren själva. Tio per körning med paus
 * emellan håller sig under gränsen med marginal, och cron kommer tillbaka om
 * en minut -- kön töms ändå, bara i mindre klunkar. */
const BATCH = 10;
const PAUS_MS = 600;

type Rad = {
  id: string;
  kind: string;
  recipient_email: string | null;
  payload: Record<string, unknown>;
  attempts: number;
};

function escapeHtml(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** "torsdag 11 september" -- samma format som formatResponseDeadline() gav.
 * Datumet kommer nu ur ärendets response_due_at, alltså organisationens avtal,
 * i stället för ur en global femdagarskonstant. */
function datum(iso: string): string {
  return new Date(iso).toLocaleDateString("sv-SE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

type Mejl = { subject: string; heading: string; sentence: string; linkPath: string; linkLabel: string };

function bygg(rad: Rad): Mejl | null {
  const p = rad.payload ?? {};
  if (rad.kind === "case_received") {
    const due = typeof p.response_due_at === "string" ? datum(p.response_due_at) : null;
    return {
      subject: "Vi har tagit emot din bild",
      heading: "Din bild är mottagen",
      sentence: due
        ? `En dermatolog går igenom den. Vi hör av oss så snart bedömningen är klar, senast ${due}.`
        : "En dermatolog går igenom den. Vi hör av oss så snart bedömningen är klar.",
      linkPath: "/hem",
      linkLabel: "Öppna Skintel",
    };
  }
  if (rad.kind === "verdict_ready") {
    return {
      subject: "Ditt svar från Skintel är klart",
      heading: "En dermatolog har gått igenom din bild",
      sentence: "Logga in för att läsa bedömningen och vad den innebär.",
      linkPath: `/flack/${String(p.spot_id ?? "")}`,
      linkLabel: "Läs svaret i Skintel",
    };
  }
  return null; // -> blocked
}

function html(m: Mejl, url: string): string {
  return [
    `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#111827;line-height:1.6">`,
    `<h1 style="font-size:18px;margin:0 0 12px">${escapeHtml(m.heading)}</h1>`,
    `<p style="margin:0 0 16px">${escapeHtml(m.sentence)}</p>`,
    `<p style="margin:0 0 24px"><a href="${url}" style="color:#2F5FE0">${escapeHtml(m.linkLabel)}</a></p>`,
    `<p style="margin:0;font-size:12px;color:#6B7280">Av integritetsskäl visas inga uppgifter i mejlet – logga in för att läsa mer.</p>`,
    `</div>`,
  ].join("");
}

Deno.serve(async (req: Request) => {
  const hemlighet = Deno.env.get("NOTIS_WORKER_SECRET");
  if (!hemlighet || req.headers.get("x-notis-secret") !== hemlighet) {
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
  }

  const url = Deno.env.get("SUPABASE_URL")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const appBase = (Deno.env.get("APP_BASE_URL") ?? "https://skintel.se").replace(/\/$/, "");
  const resendKey = Deno.env.get("RESEND_API_KEY");

  const rpc = (namn: string, body: unknown) =>
    fetch(`${url}/rest/v1/rpc/${namn}`, {
      method: "POST",
      headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  // NYCKELN KONTROLLERAS FÖRE claim_notifications, och det är hela poängen.
  //
  // Kontrollen låg tidigare inne i loopen och rapporterade som ett
  // leveransmisslyckande, vilket förbrukade ett av fem försök. Fem
  // cron-körningar med tom miljö dödförklarade därmed hela kön utan att en enda
  // rad hade nått Resend.
  //
  // En saknad miljövariabel är GLOBAL och SJÄLVLÄKANDE: den gäller varje rad
  // lika mycket, och den läker av att någon sätter en secret -- inte av att
  // någon rör raden. Därför inte heller 'blocked', som är till för radbundna
  // fel där en människa måste ändra just den raden (ingen godkänd text för
  // notistypen, ingen bekräftad mottagaradress).
  //
  // Rätt beteende är att inte röra kön alls. Ingen rad claimas, inget försök
  // bränns, ingen rad hamnar i 'sending' och riskerar en återtagning. Kön går
  // ut av sig själv vid nästa körning efter att nyckeln satts.
  if (!resendKey) {
    console.error("RESEND_API_KEY saknas -- kön lämnas orörd, ingen rad claimad.");
    return new Response(
      JSON.stringify({ error: "email_not_configured", hamtade: 0, skickade: 0 }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  const claimed = await rpc("claim_notifications", { _limit: BATCH });
  if (!claimed.ok) {
    return new Response(JSON.stringify({ error: "claim_failed", detail: await claimed.text() }), { status: 500 });
  }
  const rader = (await claimed.json()) as Rad[];

  const rapport = { hamtade: rader.length, skickade: 0, misslyckade: 0, blockerade: 0 };

  for (const rad of rader) {
    const klar = (ok: boolean, fel?: string, blocked = false) =>
      rpc("complete_notification", { _id: rad.id, _ok: ok, _error: fel ?? null, _blocked: blocked });

    const m = bygg(rad);
    if (!m) {
      // Ingen godkänd text för den här notistypen. Blir liggande synlig.
      await klar(false, `ingen godkänd text för notistypen '${rad.kind}'`, true);
      rapport.blockerade++;
      continue;
    }
    if (!rad.recipient_email) {
      // Ingen bekräftad adress. Det är inte ett fel att göra om -- det är ett
      // tillstånd som bara ändras av att användaren bekräftar en adress.
      await klar(false, "ingen bekräftad mottagaradress", true);
      rapport.blockerade++;
      continue;
    }
    const lank = `${appBase}${m.linkPath}`;
    try {
      const r = await fetch(RESEND_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${resendKey}`,
          // Outboxens svagaste punkt, täppt av ett fält gatewayen inte
          // erbjöd. En rad som fastnat i 'sending' plockas upp igen efter fem
          // minuter (claim_notifications), och hann den första körningen
          // skicka innan den dog blir det annars två mejl. Outbox-radens id är
          // stabilt över just den omtagningen, och Resend håller nyckeln i
          // 24 timmar -- vilket täcker alla fyra omförsöken.
          "Idempotency-Key": rad.id,
        },
        body: JSON.stringify({
          from: FROM,
          to: [rad.recipient_email],
          subject: m.subject,
          html: html(m, lank),
          text: `${m.heading}\n\n${m.sentence}\n\n${m.linkLabel}: ${lank}`,
        }),
      });
      if (r.ok) {
        await klar(true);
        rapport.skickade++;
      } else {
        // 429 räknas som ett vanligt misslyckande och kostar ett av fem
        // försök. Med pausen nedan ska det inte hända; händer det ändå är
        // raden tillbaka om 60 sekunder och orsaken syns i last_error.
        await klar(false, `resend ${r.status}: ${(await r.text()).slice(0, 300)}`);
        rapport.misslyckade++;
      }
    } catch (err) {
      await klar(false, String((err as Error)?.message ?? err).slice(0, 300));
      rapport.misslyckade++;
    }

    // Håller oss under Resends 2/s. Se noten vid PAUS_MS.
    await new Promise((r) => setTimeout(r, PAUS_MS));
  }

  return new Response(JSON.stringify(rapport), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
