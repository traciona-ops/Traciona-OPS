"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Gravação de áudio no padrão da nota de voz do WhatsApp (opus 16kHz mono).
 * `onRecorded` recebe o arquivo pronto pra envio; cancelar não dispara nada.
 *
 * Se o componente desmontar no meio de uma gravação (trocar de lead, fechar o
 * dock), o interval e o microfone são liberados mesmo sem `stop()` ter rodado.
 */
export function useAudioRecorder({
  onRecorded,
  onError,
}: {
  onRecorded: (file: File) => void | Promise<void>;
  onError?: (message: string) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [recSec, setRecSec] = useState(0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recorderRef = useRef<any>(null);
  const cancelRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // callbacks sempre atuais dentro do ondataavailable (que é criado no start)
  const onRecordedRef = useRef(onRecorded);
  onRecordedRef.current = onRecorded;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  async function start() {
    try {
      const { default: Recorder } = await import("opus-recorder");
      const rec = new Recorder({
        encoderPath:
          "https://cdn.jsdelivr.net/npm/opus-recorder@8.0.5/dist/encoderWorker.min.js",
        encoderApplication: 2048, // VOIP
        encoderSampleRate: 16000, // WhatsApp voice note = 16kHz mono
        numberOfChannels: 1,
        streamPages: false,
      });
      cancelRef.current = false;
      rec.ondataavailable = async (typedArray: BlobPart) => {
        if (cancelRef.current) return;
        const blob = new Blob([typedArray], { type: "audio/ogg" });
        if (!blob.size) return;
        await onRecordedRef.current(
          new File([blob], "audio.ogg", { type: "audio/ogg" })
        );
      };
      await rec.start();
      recorderRef.current = rec;
      setRecording(true);
      setRecSec(0);
      timerRef.current = setInterval(() => setRecSec((s) => s + 1), 1000);
    } catch {
      onErrorRef.current?.("Não consegui acessar o microfone (permita o acesso).");
    }
  }

  function stop(sendIt: boolean) {
    cancelRef.current = !sendIt;
    if (timerRef.current) clearInterval(timerRef.current);
    setRecording(false);
    setRecSec(0);
    recorderRef.current?.stop();
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (recorderRef.current) {
        cancelRef.current = true; // não manda áudio de um componente que já foi
        recorderRef.current.stop();
      }
    };
  }, []);

  const elapsed = `${String(Math.floor(recSec / 60)).padStart(2, "0")}:${String(
    recSec % 60
  ).padStart(2, "0")}`;

  return { recording, elapsed, start, stop };
}
