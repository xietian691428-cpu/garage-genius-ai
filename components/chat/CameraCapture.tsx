"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, FlipHorizontal, Flashlight, Image as ImageIcon, X } from "lucide-react";
import { useBodyScrollLock } from "@/lib/hooks/useBodyScrollLock";
import { compressImageDataUrl } from "@/lib/image";

type Props = {
  open: boolean;
  onClose: () => void;
  onCapture: (dataUrl: string) => void;
  /** Fallback when getUserMedia is unavailable / denied */
  onPickGallery?: () => void;
};

type Facing = "environment" | "user";

/**
 * Full-screen in-app camera for garage DIY (phone / iPad).
 * Rear camera by default — frame the leak, pad, warning light, then send to AI.
 */
export default function CameraCapture({
  open,
  onClose,
  onCapture,
  onPickGallery,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<Facing>("environment");
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [live, setLive] = useState(false);

  useBodyScrollLock(open);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setTorchOn(false);
    setTorchSupported(false);
    setLive(false);
  }, []);

  const startCamera = useCallback(
    async (nextFacing: Facing) => {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setError(
          "Camera API not available in this browser. Use the gallery button instead.",
        );
        return;
      }

      setStarting(true);
      setError(null);
      stopStream();

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: nextFacing },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });

        streamRef.current = stream;
        setLive(true);
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => {
            /* autoplay policies — play() after user gesture is usually fine */
          });
        }

        const track = stream.getVideoTracks()[0];
        const caps = track?.getCapabilities?.() as
          | MediaTrackCapabilities & { torch?: boolean }
          | undefined;
        setTorchSupported(Boolean(caps && "torch" in caps && caps.torch));
      } catch (err) {
        console.warn("[CameraCapture]", err);
        setLive(false);
        const name = err instanceof DOMException ? err.name : "";
        if (name === "NotAllowedError" || name === "PermissionDeniedError") {
          setError(
            "Camera permission denied. Allow camera access in browser settings, or pick a photo from your gallery.",
          );
        } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
          setError("No camera found on this device. Pick a photo from your gallery.");
        } else {
          setError(
            "Could not open the camera. Try again, or pick a photo from your gallery.",
          );
        }
      } finally {
        setStarting(false);
      }
    },
    [stopStream],
  );

  useEffect(() => {
    if (!open) {
      stopStream();
      setPreview(null);
      setError(null);
      return;
    }

    void startCamera(facing);

    return () => {
      stopStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restart only when sheet opens / facing flips
  }, [open, facing]);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || !torchSupported) return;
    try {
      const next = !torchOn;
      await track.applyConstraints({
        advanced: [{ torch: next } as MediaTrackConstraintSet],
      });
      setTorchOn(next);
    } catch {
      setTorchSupported(false);
    }
  };

  const takePhoto = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Mirror only for front camera preview consistency
    if (facing === "user") {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0);

    const raw = canvas.toDataURL("image/jpeg", 0.92);
    const compressed = await compressImageDataUrl(raw, {
      maxWidth: 1600,
      maxHeight: 1600,
      quality: 0.82,
    });
    setPreview(compressed);
    stopStream();
  };

  const usePhoto = () => {
    if (!preview) return;
    onCapture(preview);
    setPreview(null);
    onClose();
  };

  const retake = () => {
    setPreview(null);
    void startCamera(facing);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col bg-black"
      role="dialog"
      aria-modal="true"
      aria-label="Take a photo for AI diagnosis"
    >
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={() => {
            stopStream();
            setPreview(null);
            onClose();
          }}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white"
          aria-label="Close camera"
        >
          <X className="h-6 w-6" />
        </button>
        <p className="min-w-0 flex-1 text-center text-sm font-medium text-white/90">
          Frame the problem area
        </p>
        <div className="w-12" aria-hidden />
      </div>

      {/* Viewfinder / preview */}
      <div className="relative mx-4 min-h-0 flex-1 overflow-hidden rounded-3xl bg-slate-900">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt="Captured photo"
            className="h-full w-full object-contain"
          />
        ) : (
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className={`h-full w-full object-cover ${
              facing === "user" ? "scale-x-[-1]" : ""
            }`}
          />
        )}

        {!preview && !error && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-4 pb-5 pt-12">
            <p className="text-center text-sm text-white/85">
              Leak · worn pad · warning light · crack — then send to AI
            </p>
          </div>
        )}

        {(error || starting) && !preview && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-6">
            <div className="max-w-sm text-center">
              {starting ? (
                <p className="text-sm text-slate-300">Starting camera…</p>
              ) : (
                <>
                  <p className="text-sm text-amber-100">{error}</p>
                  <div className="mt-4 flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => void startCamera(facing)}
                      className="min-h-[48px] rounded-2xl bg-cyan-500 px-4 font-semibold text-black"
                    >
                      Try again
                    </button>
                    {onPickGallery && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onPickGallery();
                        }}
                        className="min-h-[48px] rounded-2xl border border-white/20 px-4 text-white"
                      >
                        Choose from gallery
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5">
        {preview ? (
          <div className="mx-auto flex max-w-md gap-3">
            <button
              type="button"
              onClick={retake}
              className="min-h-[56px] flex-1 rounded-2xl border border-white/25 text-base font-medium text-white"
            >
              Retake
            </button>
            <button
              type="button"
              onClick={usePhoto}
              className="min-h-[56px] flex-[1.4] rounded-2xl bg-cyan-500 text-base font-semibold text-black"
            >
              Send to AI
            </button>
          </div>
        ) : (
          <div className="mx-auto flex max-w-lg items-center justify-between gap-4">
            <button
              type="button"
              onClick={() => {
                onClose();
                onPickGallery?.();
              }}
              className="flex h-14 w-14 flex-col items-center justify-center rounded-2xl bg-white/10 text-white"
              aria-label="Choose from gallery"
            >
              <ImageIcon className="h-6 w-6" />
            </button>

            <button
              type="button"
              onClick={() => void takePhoto()}
              disabled={Boolean(error) || starting || !live}
              className="flex h-[76px] w-[76px] items-center justify-center rounded-full border-[5px] border-white bg-white/15 shadow-lg disabled:opacity-40"
              aria-label="Take photo"
            >
              <span className="h-14 w-14 rounded-full bg-white" />
            </button>

            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() =>
                  setFacing((f) => (f === "environment" ? "user" : "environment"))
                }
                className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-white"
                aria-label="Flip camera"
              >
                <FlipHorizontal className="h-5 w-5" />
              </button>
              {torchSupported && (
                <button
                  type="button"
                  onClick={() => void toggleTorch()}
                  className={`flex h-12 w-12 items-center justify-center rounded-2xl ${
                    torchOn ? "bg-amber-400 text-black" : "bg-white/10 text-white"
                  }`}
                  aria-label={torchOn ? "Turn off flashlight" : "Turn on flashlight"}
                >
                  <Flashlight className="h-5 w-5" />
                </button>
              )}
            </div>
          </div>
        )}

        {!preview && (
          <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-[11px] text-white/50">
            <Camera className="h-3.5 w-3.5" />
            Photo stays on device until you send it to AI. Video coming later.
          </p>
        )}
      </div>
    </div>
  );
}
