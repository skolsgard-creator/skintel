// Kameraströmmen i sökaren. Bakre kameran, så hög upplösning telefonen ger,
// och bilden tas genom ImageCapture där det finns (Chrome på Android: hela
// kamerapipelinen, full upplösning) och annars ur videoströmmen via canvas
// (Safari på iOS). Kameraappen och galleriet är alltid alternativ -- se
// sokare.tsx -- så ett nej här är aldrig en återvändsgränd.

export type CameraFailure = "denied" | "unavailable";

export class CameraError extends Error {
  constructor(public readonly kind: CameraFailure) {
    super(kind === "denied" ? "Kameran är blockerad för Skintel i webbläsaren." : "Ingen kamera hittades.");
  }
}

export type Camera = {
  stream: MediaStream;
  track: MediaStreamTrack;
  /** En bild i så hög upplösning som vägen medger. */
  takePhoto(video: HTMLVideoElement): Promise<Blob>;
  stop(): void;
};

type ImageCaptureLike = { takePhoto(): Promise<Blob> };
type ImageCaptureCtor = new (track: MediaStreamTrack) => ImageCaptureLike;

export function cameraSupported(): boolean {
  return typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
}

export async function startCamera(): Promise<Camera> {
  if (!cameraSupported()) throw new CameraError("unavailable");
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1920 },
        height: { ideal: 1440 },
      },
    });
  } catch (error) {
    const name = (error as { name?: string })?.name;
    if (name === "NotAllowedError" || name === "SecurityError") throw new CameraError("denied");
    throw new CameraError("unavailable");
  }
  const track = stream.getVideoTracks()[0];
  if (!track) {
    stream.getTracks().forEach((t) => t.stop());
    throw new CameraError("unavailable");
  }

  const Ctor = (globalThis as { ImageCapture?: ImageCaptureCtor }).ImageCapture;
  const capture = Ctor ? safeImageCapture(Ctor, track) : null;

  return {
    stream,
    track,
    async takePhoto(video) {
      if (capture) {
        try {
          const blob = await capture.takePhoto();
          if (blob.size > 0) return blob;
        } catch {
          // Faller tillbaka på videobilden nedan; vissa enheter säger ja
          // till ImageCapture men levererar inte.
        }
      }
      return frameFromVideo(video);
    },
    stop() {
      stream.getTracks().forEach((t) => t.stop());
    },
  };
}

function safeImageCapture(Ctor: ImageCaptureCtor, track: MediaStreamTrack): ImageCaptureLike | null {
  try {
    return new Ctor(track);
  } catch {
    return null;
  }
}

async function frameFromVideo(video: HTMLVideoElement): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx || canvas.width === 0) throw new Error("Bilden kunde inte tas. Försök igen.");
  ctx.drawImage(video, 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.95));
  if (!blob) throw new Error("Bilden kunde inte tas. Försök igen.");
  return blob;
}
