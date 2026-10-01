// Filen till telefonen. I webbläsaren och i Android-appen laddas den ner
// med en vanlig länk. I iPhone-appen på hemskärmen laddar en länk inte ner
// någonting, så där öppnas delningsbladet, med Spara i Filer.
//
// Delningsbladet kräver ett färskt tryck. Tar journalen några sekunder att
// ta fram kan trycket ha hunnit gå ut; då säger funktionen det, och knappen
// ber om ett tryck till.

export type Delivery = "downloaded" | "shared" | "cancelled" | "needs-tap";

/** Hemskärmsappen på iPhone, där delningsbladet är vägen. */
export function shareIsTheWay(file: File): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return (
    nav.standalone === true && typeof nav.canShare === "function" && nav.canShare({ files: [file] })
  );
}

export async function deliver(file: File): Promise<Delivery> {
  if (shareIsTheWay(file)) {
    try {
      await navigator.share({ files: [file], title: file.name });
      return "shared";
    } catch (error) {
      const name = (error as { name?: string } | null)?.name;
      if (name === "AbortError") return "cancelled";
      if (name === "NotAllowedError") return "needs-tap";
      throw error;
    }
  }
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  // Webbläsaren har läst filen när nedladdningen börjat; länken rensas efter en stund.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return "downloaded";
}
