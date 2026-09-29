import { cn } from "@/lib/utils";
import { dateLong, timeOfDay } from "./datum";
import type { TimelineStep } from "./tidslinje";

// Tidslinjen som en ordnad lista, samma mönster som en paketspårning. Inga
// blågröna prickar: blågrönt betyder "svarar på tryck", och här går inget
// att trycka på.

export function TimelineView({ steps }: { steps: TimelineStep[] }) {
  return (
    <ol className="flex flex-col" aria-label="Vad som har hänt">
      {steps.map((step, i) => {
        const last = i === steps.length - 1;
        const when = step.at ? `${dateLong(step.at)} kl. ${timeOfDay(step.at)}` : null;
        const meta = [step.detail, when].filter(Boolean).join(" · ");
        return (
          <li
            key={step.key}
            aria-current={step.state === "current" ? "step" : undefined}
            className={cn("flex gap-3", !last && "pb-5")}
          >
            <span aria-hidden className="flex w-3 flex-col items-center pt-1.5">
              <span
                className={cn(
                  "size-3 shrink-0 rounded-full",
                  step.state === "done" && "bg-foreground",
                  step.state === "current" && "border-2 border-foreground bg-card",
                  step.state === "upcoming" && "border-2 border-border-strong bg-card",
                )}
              />
              {!last ? <span className="mt-1 w-px flex-1 bg-border-strong" /> : null}
            </span>
            <div className="min-w-0">
              <p className={cn("font-medium", step.state === "upcoming" && "text-muted-foreground")}>{step.label}</p>
              {meta ? <p className="text-sm text-muted-foreground">{meta}</p> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
