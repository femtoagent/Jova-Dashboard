"use client";

import { useRef, useState } from "react";
import { useJovaStore } from "@/lib/state/useJovaStore";
import { useConversation } from "@/lib/conversation/useConversation";

/** Read a File into a base64 data URL — serves both the inline preview and the server upload
 *  (a blob: object URL is browser-only and useless past the BFF). Shared with the chat drag-and-drop. */
export function fileToDataUrl(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(typeof r.result === "string" ? r.result : "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(f);
  });
}

export function Composer() {
  const [text, setText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const { send } = useConversation();
  const micOn = useJovaStore((s) => s.micOn);
  const target = useJovaStore((s) => s.sessions.find((x) => x.id === s.activeSessionId)?.target ?? null);
  // attachments are shared in the store so the chat drag-and-drop can stage them too
  const pendingImage = useJovaStore((s) => s.pendingImage);
  const pendingFile = useJovaStore((s) => s.pendingFile);
  const setPendingImage = useJovaStore((s) => s.setPendingImage);
  const setPendingFile = useJovaStore((s) => s.setPendingFile);
  const clearPending = useJovaStore((s) => s.clearPending);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const dataUrl = await fileToDataUrl(f);
    if (f.type.startsWith("image/")) setPendingImage(dataUrl);
    else setPendingFile({ name: f.name, mime: f.type || "application/octet-stream", dataUrl });
  };

  const submit = () => {
    const t = text.trim();
    if (!t && !pendingImage && !pendingFile) return;
    const image = pendingImage ?? undefined;
    const file = pendingFile ?? undefined;
    setText("");
    clearPending();
    void send(t, { image, file });
  };

  return (
    <div className="px-3 pb-3 pt-2">
      {(pendingImage || pendingFile) && (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {pendingImage && (
            <div className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 p-1 pr-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={pendingImage} alt="attachment" className="h-10 w-10 rounded object-cover" />
              <span className="text-[11px] text-white/50">image</span>
              <button onClick={() => setPendingImage(null)} title="Remove" className="text-white/40 transition hover:text-rose-300">
                ×
              </button>
            </div>
          )}
          {pendingFile && (
            <div className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5">
              <span className="text-base">📄</span>
              <span className="max-w-[180px] truncate text-[11px] text-white/60">{pendingFile.name}</span>
              <span className="text-[10px] text-white/30">→ vault</span>
              <button onClick={() => setPendingFile(null)} title="Remove" className="text-white/40 transition hover:text-rose-300">
                ×
              </button>
            </div>
          )}
        </div>
      )}
      <div className="flex items-end gap-2">
        <button
          onClick={() => fileRef.current?.click()}
          title="Attach an image or a file (or drag it onto the chat)"
          className="h-[44px] shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 text-lg text-white/60 transition hover:bg-white/10"
        >
          📎
        </button>
        <input ref={fileRef} type="file" className="hidden" onChange={onPick} />
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={1}
          placeholder={micOn ? "Listening… (mic stub) — or just type" : target ? `Message ${target.teamName}'s ${target.label}…` : "Talk to Jova…"}
          className="max-h-32 min-h-[44px] flex-1 resize-none rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-[15px] text-white outline-none placeholder:text-white/35 focus:border-cyan-300/40 focus:bg-white/[0.07]"
        />
        <button
          onClick={submit}
          className="h-[44px] shrink-0 rounded-xl border border-cyan-300/30 bg-cyan-400/20 px-4 text-sm font-medium text-cyan-50 transition hover:bg-cyan-400/30"
        >
          Send
        </button>
      </div>
    </div>
  );
}
