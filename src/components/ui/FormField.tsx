"use client";

import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";

type ControlProps = {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  required?: boolean;
};

/**
 * Label + control + hint + error. The control (input, select, textarea) gets
 * its id, aria-describedby and aria-invalid wired up; pass `id` on the control
 * to keep a specific one.
 */
export function FormField({
  label,
  hint,
  error,
  required,
  className = "",
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  className?: string;
  children: ReactElement<ControlProps>;
}) {
  const auto = useId();
  const id = (isValidElement(children) && children.props.id) || auto;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [children.props["aria-describedby"], hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={className}>
      <label className="label" htmlFor={id}>
        {label}
        {required && <span aria-hidden> *</span>}
      </label>
      {cloneElement(children, {
        id,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : children.props["aria-invalid"],
        required: required ?? children.props.required,
      })}
      {hint && (
        <p id={hintId} className="field-hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}

