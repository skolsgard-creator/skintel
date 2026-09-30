import type { BodyPoint } from "@/figur/kontrakt";
import type { Kvalitet } from "./kvalitet";

// Utkastet till en ny kontroll: platsen, fotona och svaren, sparade i
// telefonen (IndexedDB) tills man trycker Skicka. Så överlever flödet att
// man lämnar det -- ett samtal, en låst skärm, en stängd flik -- och inga
// föräldralösa filer hamnar i lagringen: ingenting laddas upp förrän
// användaren skickar. Ett utkast i taget; det raderas när kvittot visas.
//
// Sorter, svarslägen och versionen speglar databasen (20260928202000,
// 20260929090000). Ändras frågorna räknas SYMPTOM_VERSION upp i databasen
// -- den fryses där, aldrig här -- och den här kommentaren rättas.

export type PhotoKind = "oversikt" | "narbild" | "skala";
export type PhotoSource = "sokare" | "kameraapp" | "galleri";

export type DraftPhoto = {
  kind: PhotoKind;
  blob: Blob;
  /** ISO-tid när bilden togs eller valdes. */
  takenAt: string;
  kvalitet: Kvalitet;
  kalla: PhotoSource;
  /** Bilden hade varningar och användaren valde "använd ändå". Granskaren
   *  ser det: det är hens bedömning om bilden räcker, inte mätarens. */
  skickadTrotsVarning: boolean;
};

export type Duration = "under_1_manad" | "1_till_6_manader" | "6_till_12_manader" | "over_ett_ar" | "vet_ej";
export type TriState = "ja" | "nej" | "vet_ej";

export type Symptoms = {
  duration: Duration | null;
  has_changed: TriState | null;
  change_description: string;
  itching_burning_pain: TriState | null;
  bleeding_oozing: TriState | null;
  healed_and_returned: TriState | null;
  ugly_duckling: TriState | null;
};

export const EMPTY_SYMPTOMS: Symptoms = {
  duration: null,
  has_changed: null,
  change_description: "",
  itching_burning_pain: null,
  bleeding_oozing: null,
  healed_and_returned: null,
  ugly_duckling: null,
};

export type DraftStep = 1 | 2 | 3 | 4;

export type Draft = {
  version: 1;
  startedAt: string;
  step: DraftStep;
  /** Befintlig fläck (ny kontroll av samma fläck) eller fläcken ett tidigare
   *  misslyckat inskick hann skapa -- återanvänds så att inga dubbletter uppstår. */
  spotId: string | null;
  plats: BodyPoint | null;
  foton: DraftPhoto[];
  svar: Symptoms;
  note: string;
};

const DRAFT_VERSION = 1;
const DB_NAME = "skintel";
const STORE = "utkast";
const KEY = "ny-kontroll";

export function newDraft(): Draft {
  return {
    version: DRAFT_VERSION,
    startedAt: new Date().toISOString(),
    step: 1,
    spotId: null,
    plats: null,
    foton: [],
    svar: { ...EMPTY_SYMPTOMS },
    note: "",
  };
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB kunde inte öppnas."));
  });
}

function run<T>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = op(tx.objectStore(STORE));
        tx.oncomplete = () => {
          db.close();
          resolve(req.result);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error ?? new Error("IndexedDB-fel."));
        };
        tx.onabort = () => {
          db.close();
          reject(tx.error ?? new Error("IndexedDB avbröts."));
        };
      }),
  );
}

function isDraft(value: unknown): value is Draft {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { version?: unknown }).version === DRAFT_VERSION &&
    Array.isArray((value as { foton?: unknown }).foton)
  );
}

/** Det sparade utkastet, eller null om det inte finns eller inte går att läsa. */
export async function loadDraft(): Promise<Draft | null> {
  try {
    const value = await run<unknown>("readonly", (store) => store.get(KEY));
    return isDraft(value) ? value : null;
  } catch {
    return null;
  }
}

export async function saveDraft(draft: Draft): Promise<void> {
  await run("readwrite", (store) => store.put(draft, KEY));
}

export async function clearDraft(): Promise<void> {
  try {
    await run("readwrite", (store) => store.delete(KEY));
  } catch {
    // Finns inget att rensa, eller går inte att nå: samma sak för anroparen.
  }
}

/**
 * Står ett påbörjat utkast i vägen för en ny kontroll av fläcken `spotId`?
 * Ja när utkastet gäller något annat och har arbete i sig -- foton, svar
 * eller en notering. Då frågar Ny kontroll innan utkastet ersätts, i
 * stället för att skriva över det vid första ändringen.
 */
export function draftInTheWay(saved: Draft | null, spotId: string | undefined): boolean {
  if (!saved || !spotId || saved.spotId === spotId) return false;
  const answered = Object.values(saved.svar).some((v) => v !== null && v !== "");
  return saved.foton.length > 0 || saved.note.trim() !== "" || answered;
}
