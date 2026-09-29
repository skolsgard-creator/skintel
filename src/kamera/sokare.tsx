import { useEffect, useRef, useState } from "react";
import { Camera as CameraIcon, ImageIcon, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { pillVariants } from "@/components/ui/pill";
import { cn } from "@/lib/utils";
import { measureCanvas, prepareImage, RING_ANDEL, type PreparedImage } from "./bild";
import { CameraError, startCamera, type Camera, type CameraFailure } from "./kamera";
import type { Kvalitet } from "./kvalitet";
import type { PhotoSource } from "./utkast";

// Sökaren: kameraströmmen med en ring i mitten och två mätta indikatorer,
// skärpa och ljus, som uppdateras medan man riktar. De coachar, de spärrar
// aldrig -- slutaren är alltid aktiv, och varningarna följer med bilden så
// att granskaren ser dem. Avstånd mäts inte (kan inte mätas på webben);
// ringen och instruktionen bär det. Kameraappen och galleriet finns alltid
// som alternativ, och är hela vägen när kameran nekas eller saknas.

type Props = {
  /** "Närbild" -- vilket av de tre fotona. */
  title: string;
  instruction: string;
  onPhoto(photo: PreparedImage, source: PhotoSource): void;
  onBack(): void;
  /** Visar "Hoppa över" (det tredje fotot). */
  onSkip?: () => void;
};

type Phase = { kind: "starting" } | { kind: "live" } | { kind: "failed"; reason: CameraFailure };

const MAT_INTERVALL_MS = 200;

export function Viewfinder({ title, instruction, onPhoto, onBack, onSkip }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<Camera | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "starting" });
  const [kvalitet, setKvalitet] = useState<Kvalitet | null>(null);
  const [ring, setRing] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Strömmen: startas vid montering, stoppas vid avmontering. Fel blir en
  // fas, inte ett undantag -- vyn visar alternativen i stället.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const camera = await startCamera();
        if (cancelled) {
          camera.stop();
          return;
        }
        cameraRef.current = camera;
        const video = videoRef.current;
        if (video) {
          video.srcObject = camera.stream;
          await video.play().catch(() => undefined);
        }
        setPhase({ kind: "live" });
      } catch (e) {
        if (cancelled) return;
        setPhase({ kind: "failed", reason: e instanceof CameraError ? e.kind : "unavailable" });
      }
    })();
    return () => {
      cancelled = true;
      cameraRef.current?.stop();
      cameraRef.current = null;
    };
  }, []);

  // Mätningen: fem gånger i sekunden medan strömmen är igång.
  useEffect(() => {
    if (phase.kind !== "live") return;
    const id = window.setInterval(() => {
      const video = videoRef.current;
      if (!video || video.readyState < 2 || video.videoWidth === 0) return;
      try {
        setKvalitet(measureCanvas(video));
      } catch {
        // En bild som inte går att läsa just nu -- nästa kommer om 200 ms.
      }
    }, MAT_INTERVALL_MS);
    return () => window.clearInterval(id);
  }, [phase.kind]);

  // Ringen ritas där mätningen sker: RING_ANDEL av bildens kortsida, i
  // skärmens skala när videon täcker rutan (object-fit: cover).
  useEffect(() => {
    const box = boxRef.current;
    const video = videoRef.current;
    if (!box || !video) return;
    const update = () => {
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!vw || !vh) return;
      const scale = Math.max(box.clientWidth / vw, box.clientHeight / vh);
      setRing(Math.round(Math.min(vw, vh) * scale * RING_ANDEL));
    };
    video.addEventListener("loadedmetadata", update);
    const ro = new ResizeObserver(update);
    ro.observe(box);
    update();
    return () => {
      video.removeEventListener("loadedmetadata", update);
      ro.disconnect();
    };
  }, [phase.kind]);

  async function shoot() {
    const camera = cameraRef.current;
    const video = videoRef.current;
    if (!camera || !video || busy) return;
    setBusy(true);
    setError(null);
    try {
      const raw = await camera.takePhoto(video);
      onPhoto(await prepareImage(raw), "sokare");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bilden kunde inte tas. Försök igen.");
    } finally {
      setBusy(false);
    }
  }

  async function fromFile(event: React.ChangeEvent<HTMLInputElement>, source: PhotoSource) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      onPhoto(await prepareImage(file), source);
    } catch {
      setError("Bilden kunde inte läsas. Prova en annan bild.");
    } finally {
      setBusy(false);
    }
  }

  const failed = phase.kind === "failed";

  return (
    <div className="flex h-full flex-col bg-foreground text-background">
      <div ref={boxRef} className="relative min-h-0 flex-1 overflow-hidden bg-foreground">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          aria-label="Kamerabild"
          className={cn("absolute inset-0 size-full object-cover", failed && "hidden")}
        />
        {phase.kind === "live" && ring ? (
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background/85 shadow-[0_0_0_9999px_rgba(0,0,0,0.28)]"
            style={{ width: ring, height: ring }}
          />
        ) : null}
        {phase.kind === "starting" ? (
          <p className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-sm text-background/80">
            Startar kameran …
          </p>
        ) : null}
        {failed ? (
          <div className="flex h-full flex-col justify-center gap-3 px-6 text-center">
            <p className="text-lg font-medium">
              {phase.reason === "denied" ? "Kameran är blockerad för Skintel." : "Ingen kamera hittades."}
            </p>
            <p className="text-sm text-background/80">
              {phase.reason === "denied"
                ? "Tillåt kameran i webbläsarens inställningar, eller ta bilden med telefonens kameraapp nedan."
                : "Ta bilden med telefonens kameraapp, eller välj en bild du redan har."}
            </p>
          </div>
        ) : null}
        <div className="pointer-events-none absolute inset-x-0 top-0 bg-linear-to-b from-foreground/70 to-transparent px-4 pt-safe pb-6">
          <p className="pt-3 text-eyebrow font-medium uppercase text-background/75">{title}</p>
          <p className="text-base font-medium text-balance">{instruction}</p>
        </div>
      </div>

      <div className="flex flex-col gap-3 px-4 pt-3 pb-safe">
        <div className="flex min-h-8 items-center gap-2" role="status" aria-live="polite">
          <Indicator
            label="Skärpa"
            state={kvalitet ? kvalitet.skarpa.omdome : null}
            text={kvalitet ? (kvalitet.skarpa.omdome === "bra" ? "Skarp" : "Oskarp") : "Skärpa"}
            hidden={failed}
          />
          <Indicator
            label="Ljus"
            state={kvalitet ? kvalitet.ljus.omdome : null}
            text={
              kvalitet
                ? kvalitet.varningar.includes("for_morkt")
                  ? "För mörkt"
                  : kvalitet.varningar.includes("for_ljust")
                    ? "För ljust"
                    : "Bra ljus"
                : "Ljus"
            }
            hidden={failed}
          />
          {import.meta.env.DEV && kvalitet ? (
            <span className="ml-auto font-mono text-xs tabular-nums text-background/70">
              {kvalitet.skarpa.varde} · {kvalitet.ljus.varde}
            </span>
          ) : null}
        </div>
        {error ? (
          <p role="alert" className="text-sm text-amber">
            {error}
          </p>
        ) : null}
        <div className="flex items-center justify-between gap-3">
          <label className={cn(buttonAlt, "cursor-pointer")}>
            <ImageIcon aria-hidden />
            Galleri
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => fromFile(e, "galleri")}
              disabled={busy}
            />
          </label>
          {failed ? (
            <label className={cn(buttonMain, "cursor-pointer")}>
              <CameraIcon aria-hidden />
              Kameraappen
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={(e) => fromFile(e, "kameraapp")}
                disabled={busy}
              />
            </label>
          ) : (
            <button
              type="button"
              onClick={shoot}
              disabled={phase.kind !== "live" || busy}
              aria-label="Ta bilden"
              className="pressable flex size-18 items-center justify-center rounded-full border-4 border-background/90 bg-background/20 outline-none transition-transform motion-fast active:scale-95 focus-visible:ring-[3px] focus-visible:ring-background/50 disabled:opacity-50"
            >
              {busy ? (
                <LoaderCircle className="size-7 animate-spin" aria-hidden />
              ) : (
                <span aria-hidden className="size-14 rounded-full bg-background" />
              )}
            </button>
          )}
          {failed ? (
            <span className="w-24" />
          ) : (
            <label className={cn(buttonAlt, "cursor-pointer")}>
              <CameraIcon aria-hidden />
              Kameraappen
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={(e) => fromFile(e, "kameraapp")}
                disabled={busy}
              />
            </label>
          )}
        </div>
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={onBack} className="text-background hover:bg-background/10">
            Tillbaka
          </Button>
          {onSkip ? (
            <Button variant="ghost" size="sm" onClick={onSkip} className="text-background hover:bg-background/10">
              Hoppa över
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const buttonAlt =
  "flex min-h-11 w-24 flex-col items-center justify-center gap-1 rounded-xl text-xs font-medium text-background/90 [&_svg]:size-6 focus-within:ring-[3px] focus-within:ring-background/50";
const buttonMain =
  "flex min-h-14 items-center justify-center gap-2 rounded-button bg-background px-6 text-base font-medium text-foreground [&_svg]:size-5 focus-within:ring-[3px] focus-within:ring-background/50";

function Indicator({
  label,
  state,
  text,
  hidden,
}: {
  label: string;
  state: "bra" | "varning" | null;
  text: string;
  hidden: boolean;
}) {
  if (hidden) return null;
  return (
    <span
      className={cn(
        pillVariants({ variant: state === "bra" ? "primary" : state === "varning" ? "amber" : "outline" }),
        state === null && "border-background/40 text-background/70",
      )}
      aria-label={`${label}: ${text}`}
    >
      {text}
    </span>
  );
}
