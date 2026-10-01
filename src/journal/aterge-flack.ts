import { dateWithYear, timeOfDay } from "@/arenden/datum";
import {
  followupSentence,
  letterDate,
  outcomeSentence,
  paragraphs,
  showsWayForward,
  WAY_FORWARD,
} from "@/arenden/brevtext";
import { PHOTO_KIND_LABEL } from "@/arenden/fotosort";
import { dueLine } from "@/arenden/klocka";
import { answerRows } from "@/arenden/svarrader";
import { timeline, type TimelineStep } from "@/arenden/tidslinje";
import { retakeInstruction, statusPill } from "@/arenden/utfall";
import { anamnesisRows, skinTypeLabel } from "./anamnes";
import { accessRow } from "./logg";
import type { Block, JournalCase, Row } from "./typer";

// Återgivningen av en fläckkontroll (case_kind 'lesion'). Samma ordning och
// samma ord som ärendesidan: det som gäller nu -- brevet, läkarens orsaker
// till nya bilder eller klockan -- sedan "Så här långt", fotona och svaren.
// Det journalen har utöver sidan: hälsouppgifterna som frystes vid
// inskicket, läkarens hudtyp och vem som har öppnat fotona.

const when = (iso: string) => `${dateWithYear(iso)} kl. ${timeOfDay(iso)}`;

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Ärendets korta nummer: de första åtta tecknen i id:t. */
export function caseRef(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

/** Tidslinjen som rader: vad till vänster, när och av vem till höger. */
function timelineRows(steps: TimelineStep[]): Row[] {
  return steps.map((step) => {
    switch (step.key) {
      case "skickad":
        return { label: "Skickad", value: step.at ? when(step.at) : "" };
      case "antagen":
        return {
          label: "Antagen",
          value: step.state === "done" && step.at ? when(step.at) : step.label,
        };
      case "besvarad":
        if (step.state === "done") {
          const time = step.at ? when(step.at) : "";
          return { label: "Besvarad", value: [time, step.detail].filter(Boolean).join(" ") };
        }
        if (step.state === "current") {
          return {
            label: "Svar",
            value: step.detail ? `${step.label}, ${step.detail}` : step.label,
          };
        }
        return { label: "Svar", value: capitalize(step.detail ?? "") };
      case "uppfoljning":
        return { label: "Uppföljning", value: step.detail ? capitalize(step.detail) : step.label };
    }
  });
}

function letterBlocks(c: JournalCase): Block[] {
  const r = c.record;
  const blocks: Block[] = [{ t: "heading", level: 3, text: "Brev från hudläkaren" }];
  if (r.reviewed_at) blocks.push({ t: "text", style: "small", text: letterDate(r.reviewed_at) });
  for (const p of paragraphs(r.dermatologist_verdict))
    blocks.push({ t: "text", style: "letter", text: p });
  const outcome = outcomeSentence(r.dermatologist_outcome);
  if (outcome) blocks.push({ t: "text", style: "letterStrong", text: outcome });
  const followup = followupSentence(r.followup_interval_weeks, r.followup_due_at, r.reviewed_at);
  if (followup) blocks.push({ t: "text", style: "letter", text: followup });
  if (showsWayForward(r.dermatologist_outcome)) {
    blocks.push(
      { t: "text", style: "strong", text: WAY_FORWARD.title },
      { t: "text", style: "body", text: WAY_FORWARD.text },
      {
        t: "text",
        style: "small",
        text: `${WAY_FORWARD.linkText}: ${WAY_FORWARD.href.replace(/^https:\/\//, "")}`,
      },
    );
  }
  if (c.reviewer) {
    blocks.push(
      { t: "text", style: "letter", text: "Vänliga hälsningar," },
      { t: "text", style: "letterStrong", text: c.reviewer.name },
    );
    if (c.reviewer.title) blocks.push({ t: "text", style: "small", text: c.reviewer.title });
  }
  if (r.assessed_skin_type) {
    blocks.push({
      t: "rows",
      rows: [{ label: "Hudtyp enligt hudläkaren", value: skinTypeLabel(r.assessed_skin_type) }],
    });
  }
  return blocks;
}

function retakeBlocks(c: JournalCase): Block[] {
  const reasons = c.record.retake_reasons?.length ? c.record.retake_reasons : ["okand"];
  const blocks: Block[] = [{ t: "heading", level: 3, text: "Hudläkaren behöver nya bilder" }];
  if (c.reviewer) blocks.push({ t: "text", style: "small", text: `Från ${c.reviewer.name}` });
  for (const reason of reasons)
    blocks.push({ t: "text", style: "body", text: `• ${retakeInstruction(reason)}` });
  return blocks;
}

function waitingBlocks(c: JournalCase, now: Date): Block[] {
  const pending = c.record.status === "pending";
  return [
    {
      t: "heading",
      level: 3,
      text: pending ? "Väntar på en hudläkare" : "En hudläkare tittar på dina foton",
    },
    { t: "text", style: "body", text: dueLine(c.record.response_due_at, now) },
  ];
}

export function lesionBlocks(c: JournalCase, now: Date): Block[] {
  const r = c.record;
  const blocks: Block[] = [
    { t: "heading", level: 2, text: `Kontroll ${dateWithYear(r.created_at)}` },
    { t: "text", style: "small", text: `Ärende ${caseRef(r.id)} · ${statusPill(r).text}` },
  ];

  if (r.status === "reviewed") blocks.push(...letterBlocks(c));
  if (r.status === "insufficient_images") blocks.push(...retakeBlocks(c));
  if (r.status === "pending" || r.status === "in_review") blocks.push(...waitingBlocks(c, now));

  blocks.push(
    { t: "heading", level: 3, text: "Så här långt" },
    { t: "rows", rows: timelineRows(timeline(r, c.reviewer)) },
  );

  if (c.photos.length > 0) {
    blocks.push(
      { t: "heading", level: 3, text: "Dina foton" },
      {
        t: "photos",
        photos: c.photos.map((p) => ({
          key: p.key,
          caption: `${PHOTO_KIND_LABEL[p.kind]} · ${when(p.takenAt ?? p.createdAt)}`,
        })),
      },
    );
  }

  blocks.push({ t: "heading", level: 3, text: "Dina svar" }, { t: "rows", rows: answerRows(r) });
  if (r.symptom_version)
    blocks.push({ t: "text", style: "small", text: `Frågorna i version ${r.symptom_version}.` });

  blocks.push({ t: "heading", level: 3, text: "Hälsouppgifter när kontrollen skickades" });
  const history = anamnesisRows(r.anamnesis);
  if (history.length > 0) {
    blocks.push({ t: "rows", rows: history });
    if (r.anamnesis_version)
      blocks.push({
        t: "text",
        style: "small",
        text: `Frågorna i version ${r.anamnesis_version}.`,
      });
  } else {
    blocks.push({ t: "text", style: "body", text: "Inga hälsouppgifter sparades med kontrollen." });
  }

  blocks.push(
    { t: "heading", level: 3, text: "Vem som har öppnat fotona" },
    {
      t: "text",
      style: "small",
      text: "Hudläkaren ser fotona först när hen har tagit kontrollen, och varje öppning loggas. Dina egna visningar räknas inte.",
    },
  );
  if (c.access.length > 0) blocks.push({ t: "rows", rows: c.access.map(accessRow) });
  else blocks.push({ t: "text", style: "body", text: "Ingen har öppnat fotona ännu." });

  return blocks;
}
