"use client";

import { useRef, useState } from "react";
import { useJovaStore } from "@/lib/state/useJovaStore";
import { useConversation } from "@/lib/conversation/useConversation";

export function Composer() {
  const [text, setText] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { send } = useConversation();
  const micOn = useJovaStore((s) => s.micOn);
  const target = useJovaStore((s) => s.sessions.find((x) => x.id === s.activeSessionId)?.target ?? null);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setImage((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(f);
    });
    e.target.value = "";
  };
  const submit = () => {
    const t = text.trim();
    if (!t && !image) return;
    const img = image;
    setText("");
    setImage(null);
    void send(t, { image: img ?? undefined });
  };

  return (
    <div className="px-3 pb-3 pt-2">
      {image && (
        <div className="mb-2 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 p-1 pr-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt="attachment" className="h-10 w-10 rounded object-cover" />
          <span className="text-[11px] text-white/50">image attached</span>
          <button
            onClick={() => {
              if (image) URL.revokeObjectURL(image);
              setImage(null);
            }}
            title="Remove"
            className="text-white/40 transition hover:text-rose-300"
          >
            ×
          </button>
        </div>
      )}
      <div className="flex items-end gap-2">
        <button
          onClick={() => fileRef.current?.click()}
          title="Attach an image (for the agent to process)"
          className="h-[44px] shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 text-lg text-white/60 transition hover:bg-white/10"
        >
          🖼
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
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
