"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "./Button";
import { FormField } from "./FormField";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Accessible dialog: role="dialog" + aria-modal, labelled by its title,
 * Esc and backdrop close it, focus moves in, stays in, and returns to the
 * element that opened it. Tall content scrolls inside the viewport.
 */
export function Modal({
  open,
  title,
  onClose,
  children,
  size = "md",
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  size?: "sm" | "md";
}) {
  if (!open) return null;
  return (
    <ModalPanel title={title} onClose={onClose} size={size}>
      {children}
    </ModalPanel>
  );
}

function ModalPanel({
  title,
  onClose,
  children,
  size,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  size: "sm" | "md";
}) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const first = panel.current?.querySelector<HTMLElement>(`form ${FOCUSABLE}`) ?? panel.current?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        close.current();
        return;
      }
      if (e.key !== "Tab" || !panel.current) return;
      const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const head = items[0];
      const tail = items[items.length - 1];
      if (e.shiftKey && document.activeElement === head) {
        e.preventDefault();
        tail.focus();
      } else if (!e.shiftKey && document.activeElement === tail) {
        e.preventDefault();
        head.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      opener?.focus?.();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto">
      <div className="fixed inset-0 bg-[rgba(18,36,31,0.45)]" aria-hidden onClick={onClose} />
      <div className="relative flex min-h-full items-end justify-center p-3 sm:items-center sm:p-4">
        <div
          ref={panel}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className={`panel relative w-full ${size === "sm" ? "max-w-md" : "max-w-lg"} p-5 fade-up`}
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <h2 id={titleId} className="display text-2xl">
              {title}
            </h2>
            <button type="button" className="desk-icon-btn -mr-2 -mt-1 shrink-0 hover:bg-[var(--mist)]" onClick={onClose} aria-label="Close dialog">
              <X size={20} aria-hidden />
            </button>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

type ConfirmOptions = {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
};
type PromptOptions = ConfirmOptions & {
  label: string;
  hint?: string;
  required?: boolean;
  multiline?: boolean;
  initialValue?: string;
};
type Pending =
  | { kind: "confirm"; options: ConfirmOptions; resolve: (ok: boolean) => void }
  | { kind: "prompt"; options: PromptOptions; resolve: (value: string | null) => void };

/**
 * In-app replacements for window.confirm / window.prompt.
 *   const dialogs = useDialogs();
 *   if (!(await dialogs.confirm({ title: "Delete?" }))) return;
 *   …render {dialogs.element} once in the page.
 */
export function useDialogs() {
  const [pending, setPending] = useState<Pending | null>(null);

  const confirm = useCallback(
    (options: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ kind: "confirm", options, resolve })),
    []
  );
  const prompt = useCallback(
    (options: PromptOptions) => new Promise<string | null>((resolve) => setPending({ kind: "prompt", options, resolve })),
    []
  );

  const element = pending ? (
    <DialogBody
      key={pending.options.title}
      pending={pending}
      onDone={() => setPending(null)}
    />
  ) : null;

  return { confirm, prompt, element };
}

function DialogBody({ pending, onDone }: { pending: Pending; onDone: () => void }) {
  const { options } = pending;
  const [value, setValue] = useState(pending.kind === "prompt" ? pending.options.initialValue ?? "" : "");

  function cancel() {
    if (pending.kind === "confirm") pending.resolve(false);
    else pending.resolve(null);
    onDone();
  }
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending.kind === "confirm") pending.resolve(true);
    else {
      if (pending.options.required && !value.trim()) return;
      pending.resolve(value);
    }
    onDone();
  }

  return (
    <Modal open title={options.title} onClose={cancel} size="sm">
      <form onSubmit={submit} className="space-y-4">
        {options.message && <div className="text-muted text-sm">{options.message}</div>}
        {pending.kind === "prompt" && (
          <FormField label={pending.options.label} hint={pending.options.hint} required={pending.options.required}>
            {pending.options.multiline ? (
              <textarea className="field min-h-[6rem]" value={value} onChange={(e) => setValue(e.target.value)} />
            ) : (
              <input className="field" value={value} onChange={(e) => setValue(e.target.value)} autoComplete="off" />
            )}
          </FormField>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={cancel}>
            Cancel
          </Button>
          <Button type="submit" variant={options.danger ? "danger" : "primary"}>
            {options.confirmLabel ?? "Confirm"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
