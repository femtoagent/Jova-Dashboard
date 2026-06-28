"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { useJovaStore } from "@/lib/state/useJovaStore";
import { useConversation } from "@/lib/conversation/useConversation";
import { useVoice } from "@/lib/conversation/useVoice";

/** Per-file attachment cap — base64 inflates ~33%, so this keeps a 5-file turn to a sane POST size. */
export const MAX_ATTACH_BYTES = 8 * 1024 * 1024;

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

const MAX_TA_HEIGHT = 88; // ~3 lines, then the textarea scrolls internally

export function Composer() {
  const [text, setText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const { send } = useConversation();
  const { pttStart, pttEnd } = useVoice();
  const micOn = useJovaStore((s) => s.micOn);
  const listening = useJovaStore((s) => s.listening);
  const sttPartial = useJovaStore((s) => s.sttPartial);
  const voiceError = useJovaStore((s) => s.voiceError);
  const setVoiceError = useJovaStore((s) => s.setVoiceError);
  const target = useJovaStore((s) => s.sessions.find((x) => x.id === s.activeSessionId)?.target ?? null);
  const isJova = !target;
  // up to 5 attachments are shared in the store so the chat drag-and-drop can stage them too
  const pendingAttachments = useJovaStore((s) => s.pendingAttachments);
  const addPendingAttachments = useJovaStore((s) => s.addPendingAttachments);
  const removePendingAttachment = useJovaStore((s) => s.removePendingAttachment);
  const clearPending = useJovaStore((s) => s.clearPending);
  const [notice, setNotice] = useState("");
  const full = pendingAttachments.length >= 5;

  // grow the textarea with its content up to ~3 lines, then scroll (layout effect = no resize flash;
  // +2 accounts for the 1px top/bottom border under border-box so 2-3 lines don't show a scrollbar)
  useLayoutEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight + 2, MAX_TA_HEIGHT) + "px";
  }, [text]);

  const flash = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice((n) => (n === msg ? "" : n)), 3500);
  };

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    await stageFiles(files);
  };

  /** Shared by the picker: drop oversized files, cap to 5 total, and tell the user what was skipped. */
  const stageFiles = async (files: File[]) => {
    const tooBig = files.filter((f) => f.size > MAX_ATTACH_BYTES).map((f) => f.name);
    const ok = files.filter((f) => f.size <= MAX_ATTACH_BYTES);
    const room = 5 - pendingAttachments.length;
    const take = ok.slice(0, Math.max(0, room));
    const overflow = ok.length - take.length;
    const atts = await Promise.all(
      take.map(async (f) => ({
        kind: f.type.startsWith("image/") ? ("image" as const) : ("file" as const),
        name: f.name,
        mime: f.type || "application/octet-stream",
        dataUrl: await fileToDataUrl(f),
      })),
    );
    if (atts.length) addPendingAttachments(atts);
    const msgs: string[] = [];
    if (tooBig.length) msgs.push(`${tooBig.length} too large (max 8MB)`);
    if (overflow > 0) msgs.push(`${overflow} over the 5-attachment limit`);
    if (msgs.length) flash(`Skipped: ${msgs.join("; ")}.`);
  };

  const submit = () => {
    const t = text.trim();
    if (!t && pendingAttachments.length === 0) return;
    const attachments = pendingAttachments.length ? pendingAttachments : undefined;
    setText("");
    clearPending();
    void send(t, { attachments });
  };

  return (
    <div className="px-3 pb-3 pt-2">
      {notice && <div className="mb-2 text-[11px] text-amber-200/70">{notice}</div>}
      {voiceError && <div className="mb-2 text-[11px] text-rose-300/80">{voiceError}</div>}
      {listening && (
        <div className="mb-2 flex items-center gap-2 text-[11px] text-cyan-200/80">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400 shadow-[0_0_6px_#67e8f9]" />
          <span className="truncate">{sttPartial || "Listening…"}</span>
        </div>
      )}
      {pendingAttachments.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {pendingAttachments.map((a, i) => (
            <div key={i} className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 p-1 pr-2">
              {a.kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.dataUrl} alt={a.name} className="h-10 w-10 rounded object-cover" />
              ) : (
                <span className="px-1 text-base">📄</span>
              )}
              <span className="max-w-[140px] truncate text-[11px] text-white/60">{a.kind === "image" ? "image" : a.name}</span>
              <button onClick={() => removePendingAttachment(i)} title="Remove" className="text-white/40 transition hover:text-rose-300">
                ×
              </button>
            </div>
          ))}
          <span className="text-[10px] text-white/30">{pendingAttachments.length}/5</span>
        </div>
      )}
      <div className="flex items-end gap-2">
        <button
          onClick={() => fileRef.current?.click()}
          disabled={full}
          title={full ? "Up to 5 attachments" : "Attach images or files (up to 5, or drag them onto the chat)"}
          className="h-[44px] shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 text-lg text-white/60 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          📎
        </button>
        <input ref={fileRef} type="file" multiple className="hidden" onChange={onPick} />
        <textarea
          ref={taRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => voiceError && setVoiceError(null)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={1}
          placeholder={micOn ? "Hands-free on — just talk, or type" : target ? `Message ${target.teamName}'s ${target.label}…` : "Talk to Jova…"}
          className="min-h-[44px] flex-1 resize-none overflow-y-auto rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-[15px] text-white outline-none placeholder:text-white/35 focus:border-cyan-300/40 focus:bg-white/[0.07]"
        />
        {isJova && (
          <button
            onPointerDown={(e) => {
              e.preventDefault();
              e.currentTarget.setPointerCapture(e.pointerId); // keep the release even if the pointer leaves
              void pttStart();
            }}
            onPointerUp={() => void pttEnd()}
            onPointerCancel={() => void pttEnd()}
            disabled={micOn}
            title={micOn ? "Hands-free mic is on" : "Hold to talk"}
            className={`h-[44px] shrink-0 select-none rounded-xl border px-3 text-lg transition disabled:cursor-not-allowed disabled:opacity-40 ${
              listening && !micOn
                ? "border-cyan-300/50 bg-cyan-400/30 text-cyan-50 animate-pulse"
                : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10"
            }`}
          >
            🎙
          </button>
        )}
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
