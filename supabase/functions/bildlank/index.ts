// Dörren till en patientbild. EN väg, och den loggar.
//
// PROJEKTETS FÖRSTA EDGE FUNCTION. Det är ett infrastrukturval och inte bara
// en funktion: notis-outboxens arbetare (se KNOWN_ISSUES.md och diskussionen
// om att låta ett tillståndsbyte i databasen utlösa mejlet) hör hemma på
// samma ställe. CLAUDE.md "Multiple clients" listar tre vägar ut ur att den
// här webbappen är enda ingången till funktionslagret; det här är ett steg
// mot väg (3), Edge Functions.
//
//
// VARFÖR DÖRREN INTE KAN LIGGA I DATABASEN
//
// Allt annat i den här omgången har flyttats till Postgres, så att en andra
// klient -- granskarwebben, ett eget projekt mot samma Supabase -- ärver
// behörigheten från databasen. Just den här dörren kan inte det:
//
//   * Signerade storage-URL:er utfärdas av storage-API:t. Postgres kan inte
//     anropa det synkront -- pg_net är fire-and-forget, svaret landar i en
//     tabell efteråt och går inte att få tillbaka in i samma fråga.
//   * Postgres kan inte läsa bilden heller. storage.objects är metadata;
//     bytes ligger i S3.
//   * Att signera token för hand i Postgres vore tekniskt möjligt (det är en
//     HS256-JWT över {url, iat, exp}) men skulle kräva projektets JWT-secret
//     i databasen och binda oss till ett odokumenterat tokenformat. Avvisat.
//
//
// DEN HÄR FILEN INNEHÅLLER NOLL BEHÖRIGHETSLOGIK
//
// Det finns inget `if` här om vem som får se vad. Anropet går till
// public.request_case_image() MED ANROPARENS EGEN JWT, så auth.uid() och
// reviewer_session_ok() utvärderas precis som i policyerna. Där sker
// behörighetskontrollen OCH loggskrivningen, i samma transaktion. Kommer
// ingen sökväg tillbaka finns ingen bild att signera.
//
// Att i stället köra RPC:n med service-role och skicka med ett user-id vore
// enklare och fel: det inför en andra definition av identitet, och en bugg
// skulle kunna släppa igenom vilket uid som helst.
//
//
// VARFÖR fetch OCH INTE supabase-js
//
// Två HTTP-anrop. SDK:n hade lagt till ett beroende för att slippa dem, och
// dolt exakt vilka headers som skickas -- vilket är hela säkerhetsegenskapen
// här (anroparens token till RPC:n, service-role BARA till signeringen).
//
// SUPABASE_URL, SUPABASE_ANON_KEY och SUPABASE_SERVICE_ROLE_KEY injiceras av
// plattformen i varje edge-funktion. Ingen ny hemlighet behöver sättas.

const BUCKET = "skin-photos";

/** Minuter, inte timmar.
 *
 * En signerad URL är en bärartoken: den som har strängen får bilden, oavsett
 * om granskaren fortfarande är tilldelad ärendet. Med den timme som
 * review.functions.ts använt betyder ett återlämnat ärende att den förra
 * granskaren har kvar bildåtkomst i upp till en timme efter att hen släppt
 * det -- en kopia av bilden som överlever behörighetskontrollen.
 *
 * 120 sekunder räcker för att <img> ska hinna hämta. En redan laddad bild
 * påverkas inte av att URL:en går ut. Priset är att klienten inte får cacha
 * URL:en utan måste fråga igen -- och varje ny fråga blir en ny loggrad,
 * vilket är korrekt: varje visning ÄR en åtkomst. */
const TTL_SECONDS = 120;

const CORS = {
  // Bred med flit: granskarwebbens domän finns inte än. Att öppna för alla
  // origins skyddar ingenting bort -- anropet kräver ändå en giltig JWT, och
  // webbläsare skickar inte Authorization-headern av sig själva. Snäva av när
  // domänen finns.
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

/** Postgres RAISE -> HTTP-status. Felkoderna är funktionens egna strängar och
 * speglar REVIEW_ERRORS-mönstret i org.schemas.ts: ett distinkt fel per orsak,
 * så att en klient kan säga något begripligt i stället för "gick inte". */
function mapRpcError(raw: string): { status: number; error: string } {
  const t = raw.toLowerCase();
  if (t.includes("not_authenticated")) return { status: 401, error: "not_authenticated" };
  if (t.includes("case_not_found")) return { status: 404, error: "case_not_found" };
  if (t.includes("not_authorized_for_case"))
    return { status: 403, error: "not_authorized_for_case" };
  return { status: 500, error: "image_unavailable" };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const authorization = req.headers.get("Authorization");
  if (!authorization) return json(401, { error: "not_authenticated" });

  let reviewId: unknown;
  try {
    reviewId = (await req.json())?.reviewId;
  } catch {
    return json(400, { error: "bad_request" });
  }
  if (typeof reviewId !== "string" || !UUID.test(reviewId)) {
    return json(400, { error: "bad_request" });
  }

  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) return json(500, { error: "misconfigured" });

  // 1. Behörighet + åtkomstlogg, som anroparen. Allt avgörs här.
  const rpc = await fetch(`${url}/rest/v1/rpc/request_case_image`, {
    method: "POST",
    headers: {
      apikey: anon,
      Authorization: authorization,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ _review_id: reviewId }),
  });

  if (!rpc.ok) {
    const { status, error } = mapRpcError(await rpc.text());
    return json(status, { error });
  }

  const imagePath = await rpc.json();
  if (typeof imagePath !== "string" || imagePath.length === 0) {
    return json(403, { error: "not_authorized_for_case" });
  }

  // 2. Signera. Först här används service-role, och bara till det här.
  const signed = await fetch(`${url}/storage/v1/object/sign/${BUCKET}/${imagePath}`, {
    method: "POST",
    headers: {
      apikey: service,
      Authorization: `Bearer ${service}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ expiresIn: TTL_SECONDS }),
  });

  if (!signed.ok) {
    // Loggraden är redan skriven. Det är rätt ordning: loggen kan
    // överrapportera (loggad, men signeringen föll) men aldrig
    // underrapportera.
    console.error("signering misslyckades", signed.status, await signed.text());
    return json(502, { error: "image_unavailable" });
  }

  const { signedURL } = (await signed.json()) as { signedURL: string };
  return json(200, {
    url: `${url}/storage/v1${signedURL}`,
    expiresIn: TTL_SECONDS,
  });
});
