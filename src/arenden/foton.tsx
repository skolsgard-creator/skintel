import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PHOTO_KIND_LABEL } from "./fotosort";
import type { CasePhoto } from "./typer";

// Fotona i ärendet: tre miniatyrer i rad, tryck för full storlek. Visaren är
// ett <dialog> med showModal(): webbläsaren sköter fokus, Esc och att sidan
// bakom inte går att nå -- ingen egen fokusfälla att hålla rätt.

const KIND_LABEL = PHOTO_KIND_LABEL;

export function Photos({ photos }: { photos: CasePhoto[] }) {
  const [open, setOpen] = useState<CasePhoto | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  if (photos.length === 0) return null;

  return (
    <>
      <ul className="grid grid-cols-3 gap-2">
        {photos.map((photo) => (
          <li key={photo.id} className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => setOpen(photo)}
              disabled={!photo.url}
              className="pressable block overflow-hidden rounded-xl bg-muted outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35"
              aria-label={`Visa ${KIND_LABEL[photo.kind].toLowerCase()} i full storlek`}
            >
              <PhotoImage url={photo.url} alt="" className="aspect-square w-full object-cover" />
            </button>
            <p className="text-xs text-muted-foreground">{KIND_LABEL[photo.kind]}</p>
          </li>
        ))}
      </ul>

      <dialog
        ref={dialog}
        onClose={() => setOpen(null)}
        aria-label={open ? KIND_LABEL[open.kind] : "Foto"}
        className="m-0 h-dvh max-h-none w-full max-w-none bg-foreground p-0 text-background backdrop:bg-foreground/80"
      >
        {open ? (
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between px-4 pt-safe">
              <p className="pt-3 font-medium">{KIND_LABEL[open.kind]}</p>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setOpen(null)}
                aria-label="Stäng"
                className="mt-3 text-background hover:bg-background/10"
              >
                <X aria-hidden />
              </Button>
            </div>
            <div className="min-h-0 flex-1 p-4 pb-safe">
              <PhotoImage url={open.url} alt={KIND_LABEL[open.kind]} className="size-full object-contain" />
            </div>
          </div>
        ) : null}
      </dialog>
    </>
  );
}

/** En bild som säger till när den inte går att visa, i stället för en
 *  trasig ikon. Seedens platshållarfoton har ingen fil bakom sig. */
function PhotoImage({ url, alt, className }: { url: string | null; alt: string; className: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  if (!url || failed) {
    return (
      <span className={`${className} flex items-center justify-center p-2 text-center text-xs text-muted-foreground`}>
        Bilden kan inte visas
      </span>
    );
  }
  return <img src={url} alt={alt} className={className} onError={() => setFailed(true)} />;
}
