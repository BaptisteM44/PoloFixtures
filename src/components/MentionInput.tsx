"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { ChatKind, ChatPerson } from "@/lib/chat-mentions";

type BaseProps = {
  /** Chat dans lequel on écrit : sert à proposer les bonnes personnes après « @ ». */
  kind: ChatKind;
  chatId: string;
  value: string;
  onValueChange: (v: string) => void;
  multiline?: boolean;
};
type Props = BaseProps &
  Omit<React.InputHTMLAttributes<HTMLInputElement> & React.TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange">;

const peopleCache = new Map<string, Promise<ChatPerson[]>>();
function loadPeople(kind: ChatKind, id: string) {
  const key = `${kind}:${id}`;
  if (!peopleCache.has(key)) {
    peopleCache.set(key, fetch(`/api/chat-mentions?kind=${kind}&id=${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? r.json() : { people: [] }))
      .then((d) => (d.people ?? []) as ChatPerson[])
      .catch(() => []));
  }
  return peopleCache.get(key)!;
}

const fold = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Champ de chat avec @mentions : taper « @ » propose les personnes du chat
 * (clavier ↑ ↓ Entrée / Tab, ou clic). Insère « @Nom » : le serveur notifie
 * les personnes mentionnées.
 */
export const MentionInput = forwardRef<HTMLInputElement | HTMLTextAreaElement, Props>(function MentionInput(
  { kind, chatId, value, onValueChange, multiline, onKeyDown, style, ...rest },
  ref,
) {
  const fieldRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => fieldRef.current!);
  const [people, setPeople] = useState<ChatPerson[] | null>(null);
  const [query, setQuery] = useState<{ start: number; text: string } | null>(null);
  const [index, setIndex] = useState(0);

  useEffect(() => { setPeople(null); }, [kind, chatId]);

  const suggestions = query && people
    ? people.filter((p) => fold(p.name).includes(fold(query.text))).slice(0, 6)
    : [];

  function update(v: string, caret: number | null) {
    onValueChange(v);
    const upto = v.slice(0, caret ?? v.length);
    // « @ » en début de mot, suivi d'au plus deux mots (prénom nom)
    const m = /(^|\s)@([\p{L}\p{N}_.\-']*(?: [\p{L}\p{N}_.\-']*)?)$/u.exec(upto);
    if (m) {
      setQuery({ start: upto.length - m[2].length - 1, text: m[2] });
      setIndex(0);
      if (!people) loadPeople(kind, chatId).then(setPeople);
    } else {
      setQuery(null);
    }
  }

  function pick(p: ChatPerson) {
    if (!query) return;
    const before = value.slice(0, query.start);
    const after = value.slice(query.start + 1 + query.text.length);
    const next = `${before}@${p.name} ${after.replace(/^\s/, "")}`;
    onValueChange(next);
    setQuery(null);
    const caret = before.length + p.name.length + 2;
    requestAnimationFrame(() => {
      fieldRef.current?.focus();
      fieldRef.current?.setSelectionRange(caret, caret);
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement & HTMLTextAreaElement>) {
    if (suggestions.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setIndex((i) => (i + 1) % suggestions.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setIndex((i) => (i - 1 + suggestions.length) % suggestions.length); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pick(suggestions[index]); return; }
      if (e.key === "Escape") { setQuery(null); return; }
    }
    onKeyDown?.(e as never);
  }

  const common = {
    ...rest,
    ref: fieldRef,
    value,
    style: { width: "100%", ...style },
    onChange: (e: React.ChangeEvent<HTMLInputElement & HTMLTextAreaElement>) => update(e.target.value, e.target.selectionStart),
    onKeyDown: handleKeyDown,
    onBlur: (e: React.FocusEvent<HTMLInputElement & HTMLTextAreaElement>) => {
      // laisser le temps au clic sur une suggestion
      window.setTimeout(() => setQuery(null), 150);
      rest.onBlur?.(e as never);
    },
  };

  return (
    <div style={{ position: "relative", flex: (style as React.CSSProperties | undefined)?.flex ?? 1, minWidth: 0, display: "flex" }}>
      {multiline ? <textarea {...(common as React.TextareaHTMLAttributes<HTMLTextAreaElement>)} /> : <input {...(common as React.InputHTMLAttributes<HTMLInputElement>)} />}
      {suggestions.length > 0 && (
        <div role="listbox" style={{
          position: "absolute", bottom: "calc(100% + 4px)", left: 0, zIndex: 30, minWidth: 200, maxWidth: "100%",
          background: "var(--surface)", border: "2px solid var(--border)", borderRadius: 8, boxShadow: "var(--shadow)", overflow: "hidden",
        }}>
          {suggestions.map((p, i) => (
            <button key={p.id} type="button" role="option" aria-selected={i === index}
              onMouseDown={(e) => { e.preventDefault(); pick(p); }}
              style={{
                display: "block", width: "100%", textAlign: "left", padding: "7px 10px", fontSize: 13, border: "none",
                boxShadow: "none", textTransform: "none", letterSpacing: "normal", cursor: "pointer",
                background: i === index ? "var(--surface-2)" : "var(--surface)", color: "var(--text)",
              }}>
              @{p.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

/** Texte d'un message avec les @mentions mises en évidence. */
export function MentionText({ text }: { text: string }) {
  // « @Prénom » + un éventuel « Nom » en majuscule (les noms insérés par l'autocomplétion)
  const parts = text.split(/(@[\p{L}\p{N}_.\-']+(?: \p{Lu}[\p{L}\p{N}_.\-']*)?)/u);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("@") && part.length > 1
          ? <strong key={i} style={{ color: "var(--teal)" }}>{part}</strong>
          : <span key={i}>{part}</span>
      )}
    </>
  );
}
