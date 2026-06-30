"use client";

import React from "react";

/**
 * A tiny, dependency-free, XSS-safe Markdown renderer for chat messages.
 *
 * We build React nodes directly — NEVER dangerouslySetInnerHTML — so there's no HTML-injection
 * surface. We deliberately support only the subset that's useful in a conversation: paragraphs +
 * line breaks, **bold**, *italic*, `inline code`, ``` fenced code ```, # headings, - / 1. lists,
 * > blockquotes, --- rules, and [links](url) / bare URLs (http(s) + mailto only). Anything fancier
 * renders as its literal text, which is the safe failure mode while a reply is still streaming.
 */

const INLINE_RE =
  /(`[^`]+?`)|(\*\*[\s\S]+?\*\*)|(__[\s\S]+?__)|(\*[\s\S]+?\*)|((?<![A-Za-z0-9])_[^_\n]+?_(?![A-Za-z0-9]))|(\[[^\]]+?\]\([^)\s]+?\))|((?:https?:\/\/|mailto:)[^\s<]+)/;

/** Only allow safe link schemes; everything else falls back to literal text. */
function safeHref(url: string): string | null {
  const u = url.trim();
  return /^(https?:\/\/|mailto:)/i.test(u) ? u : null;
}

const linkCls = "text-cyan-300 underline decoration-cyan-300/40 underline-offset-2 hover:decoration-cyan-200";
const codeCls = "rounded bg-black/40 px-1 py-0.5 font-mono text-[0.85em] text-cyan-100/90";

/** Parse inline markup within a single line of text into React nodes (recurses for emphasis/links). */
function inline(text: string, keyBase: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let rest = text;
  let k = 0;
  while (rest.length) {
    const m = INLINE_RE.exec(rest);
    if (!m) {
      out.push(rest);
      break;
    }
    if (m.index > 0) out.push(rest.slice(0, m.index));
    const tok = m[0];
    const key = `${keyBase}-${k++}`;
    if (m[1]) {
      out.push(
        <code key={key} className={codeCls}>
          {tok.slice(1, -1)}
        </code>
      );
    } else if (m[2] || m[3]) {
      out.push(<strong key={key}>{inline(tok.slice(2, -2), key)}</strong>);
    } else if (m[4] || m[5]) {
      out.push(<em key={key}>{inline(tok.slice(1, -1), key)}</em>);
    } else if (m[6]) {
      const mm = /^\[([^\]]+?)\]\(([^)\s]+?)\)$/.exec(tok);
      const href = mm ? safeHref(mm[2]) : null;
      out.push(
        mm && href ? (
          <a key={key} href={href} target="_blank" rel="noopener noreferrer" className={linkCls}>
            {inline(mm[1], key)}
          </a>
        ) : (
          tok
        )
      );
    } else if (m[7]) {
      const href = safeHref(tok);
      out.push(
        href ? (
          <a key={key} href={href} target="_blank" rel="noopener noreferrer" className={linkCls}>
            {tok}
          </a>
        ) : (
          tok
        )
      );
    }
    rest = rest.slice(m.index + tok.length);
  }
  return out;
}

/** Join consecutive lines of a paragraph with <br/>. */
function paragraph(lines: string[], key: string): React.ReactNode {
  const kids: React.ReactNode[] = [];
  lines.forEach((ln, i) => {
    if (i > 0) kids.push(<br key={`${key}-br-${i}`} />);
    kids.push(...inline(ln, `${key}-${i}`));
  });
  return (
    <p key={key} className="whitespace-pre-wrap break-words">
      {kids}
    </p>
  );
}

const UL_RE = /^\s*[-*+]\s+(.*)$/;
const OL_RE = /^\s*\d+[.)]\s+(.*)$/;
const H_RE = /^(#{1,6})\s+(.*)$/;
const QUOTE_RE = /^\s*>\s?(.*)$/;
const FENCE_RE = /^\s*```/;
const HR_RE = /^\s*([-*_])\1{2,}\s*$/;

const H_CLS = ["text-lg font-semibold", "text-base font-semibold", "text-[15px] font-semibold", "font-semibold", "font-semibold", "font-semibold"];

/** Render markdown text as React nodes. Pass-through-safe for partial text mid-stream. */
export function Markdown({ text, className }: { text: string; className?: string }) {
  const lines = (text ?? "").replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let b = 0;

  while (i < lines.length) {
    const line = lines[i];

    // fenced code block
    if (FENCE_RE.test(line)) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !FENCE_RE.test(lines[i])) body.push(lines[i++]);
      if (i < lines.length) i++; // consume closing fence
      blocks.push(
        <pre key={`b${b++}`} className="overflow-x-auto rounded-lg border border-white/10 bg-black/40 px-3 py-2 font-mono text-[12.5px] leading-relaxed text-cyan-100/90">
          <code>{body.join("\n")}</code>
        </pre>
      );
      continue;
    }

    // horizontal rule
    if (HR_RE.test(line)) {
      blocks.push(<hr key={`b${b++}`} className="my-2 border-white/15" />);
      i++;
      continue;
    }

    // heading
    const h = H_RE.exec(line);
    if (h) {
      const level = h[1].length;
      const tag = `h${Math.min(level, 6)}`;
      blocks.push(
        React.createElement(tag, { key: `b${b++}`, className: `mt-1 ${H_CLS[level - 1]}` }, inline(h[2], `b${b}`))
      );
      i++;
      continue;
    }

    // blockquote (consecutive)
    if (QUOTE_RE.test(line)) {
      const body: string[] = [];
      while (i < lines.length && QUOTE_RE.test(lines[i])) body.push(QUOTE_RE.exec(lines[i++])![1]);
      blocks.push(
        <blockquote key={`b${b++}`} className="border-l-2 border-cyan-300/30 pl-3 text-white/70">
          {paragraph(body, `b${b}`)}
        </blockquote>
      );
      continue;
    }

    // unordered list (consecutive)
    if (UL_RE.test(line)) {
      const items: string[] = [];
      while (i < lines.length && UL_RE.test(lines[i])) items.push(UL_RE.exec(lines[i++])![1]);
      blocks.push(
        <ul key={`b${b++}`} className="list-disc space-y-0.5 pl-5">
          {items.map((it, j) => (
            <li key={j}>{inline(it, `b${b}-${j}`)}</li>
          ))}
        </ul>
      );
      continue;
    }

    // ordered list (consecutive)
    if (OL_RE.test(line)) {
      const items: string[] = [];
      while (i < lines.length && OL_RE.test(lines[i])) items.push(OL_RE.exec(lines[i++])![1]);
      blocks.push(
        <ol key={`b${b++}`} className="list-decimal space-y-0.5 pl-5">
          {items.map((it, j) => (
            <li key={j}>{inline(it, `b${b}-${j}`)}</li>
          ))}
        </ol>
      );
      continue;
    }

    // blank line
    if (line.trim() === "") {
      i++;
      continue;
    }

    // paragraph (consecutive non-blank, non-special lines)
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !FENCE_RE.test(lines[i]) &&
      !H_RE.test(lines[i]) &&
      !QUOTE_RE.test(lines[i]) &&
      !UL_RE.test(lines[i]) &&
      !OL_RE.test(lines[i]) &&
      !HR_RE.test(lines[i])
    ) {
      para.push(lines[i++]);
    }
    blocks.push(paragraph(para, `b${b++}`));
  }

  return <div className={`space-y-2 ${className ?? ""}`}>{blocks}</div>;
}

/** Render inline-only markup (**bold**, *italic*, `code`, links) for a single string — for places
 *  like the floating voice captions where block layout isn't wanted. */
export function InlineMd({ text }: { text: string }) {
  return <>{inline(text ?? "", "inl")}</>;
}
