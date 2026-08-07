"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { updateMyAvatar, removeMyAvatar } from "@/app/(dashboard)/settings/actions";

export function AccountCard({
  name,
  email,
  roleLabel,
  avatarUrl,
}: {
  name: string;
  email: string | null;
  roleLabel: string;
  avatarUrl: string | null;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setBusy(true);
    const fd = new FormData();
    fd.append("file", file);
    const r = await updateMyAvatar(fd);
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
    if (r && "error" in r) {
      setError(r.error ?? "Falha ao enviar.");
      return;
    }
    router.refresh();
  }

  async function remove() {
    setBusy(true);
    await removeMyAvatar();
    setBusy(false);
    router.refresh();
  }

  return (
    <section className="card p-5">
      <h2 className="mb-4 text-sm font-semibold">Sua conta</h2>
      <div className="flex items-center gap-3">
        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="group relative shrink-0 rounded-full"
          title="Trocar foto"
        >
          <Avatar name={name} src={avatarUrl} size={56} />
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 opacity-0 transition group-hover:opacity-100">
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin text-white" />
            ) : (
              <Camera className="h-4 w-4 text-white" />
            )}
          </span>
        </button>
        <div className="min-w-0">
          <p className="font-medium">{name}</p>
          <p className="truncate text-sm text-[var(--color-muted)]">{email}</p>
          <div className="mt-1 flex items-center gap-2">
            <span className="inline-block rounded bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[11px] text-[var(--color-muted)]">
              {roleLabel}
            </span>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="text-[11px] font-medium text-[var(--color-primary)] hover:underline disabled:opacity-50"
            >
              Trocar foto
            </button>
            {avatarUrl && (
              <button
                onClick={remove}
                disabled={busy}
                className="inline-flex items-center gap-0.5 text-[11px] text-[var(--color-muted-2)] hover:text-[var(--color-danger)] disabled:opacity-50"
              >
                <Trash2 className="h-3 w-3" />
                Remover
              </button>
            )}
          </div>
          {error && (
            <p className="mt-1 text-[11px] text-[var(--color-danger)]">{error}</p>
          )}
        </div>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onPick}
      />
    </section>
  );
}
