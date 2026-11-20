"use client";

import { useEffect, useId, useRef, useState } from "react";
import { siteConfig } from "./site-config";

type Viewer = { name: string };

/**
 * Fixed top bar of the 3D shelf: seal + "TRAC Library" lockup on the left,
 * Sign in (or the signed-in account menu) on the right.
 *
 * Sign-in state comes from GET /api/auth/me on this origin. It renders
 * "Sign in" straight away and swaps to the account menu only when that
 * request says someone is signed in, so the button is never shown in a
 * faded "loading" state.
 */
export function ShelfHeader({
  logoSrc,
  signInHref,
  deskHref,
  signOutAction,
}: {
  logoSrc: string;
  signInHref: string;
  deskHref: string;
  signOutAction: string;
}) {
  const [viewer, setViewer] = useState<Viewer | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me", { credentials: "include", cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { user?: { name?: string } | null } | null) => {
        const name = data?.user?.name?.trim();
        if (!cancelled && name) setViewer({ name });
      })
      .catch(() => {
        /* offline or not signed in: keep "Sign in" */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <header className="site-header">
      <div className="site-header__brand">
        {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size seal, no optimisation needed */}
        <img className="site-header__seal" src={logoSrc} alt="" width={36} height={36} />
        <p className="site-header__lockup">
          <span className="site-header__name">{siteConfig.headerName}</span>
          <span className="site-header__divider" aria-hidden="true" />
          <span className="site-header__tagline">{siteConfig.headerTagline}</span>
        </p>
      </div>

      {viewer ? (
        <AccountMenu name={viewer.name} deskHref={deskHref} signOutAction={signOutAction} />
      ) : (
        <a className="shelf-btn" href={signInHref}>
          <UserIcon />
          <span>Sign in</span>
        </a>
      )}
    </header>
  );
}

function AccountMenu({
  name,
  deskHref,
  signOutAction,
}: {
  name: string;
  deskHref: string;
  signOutAction: string;
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="account" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="account__button"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="account__avatar" aria-hidden="true">
          {name.slice(0, 1).toUpperCase()}
        </span>
        <span className="account__name">{name}</span>
        <span className="sr-only">: account menu</span>
      </button>
      {open && (
        <div className="account__menu" id={menuId}>
          <a className="account__item" href={deskHref}>
            Open library desk
          </a>
          <form action={signOutAction} method="post">
            <button type="submit" className="account__item">
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function UserIcon() {
  return (
    <svg
      className="shelf-btn__icon"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="8" cy="5.5" r="2.75" />
      <path d="M2.75 14c.6-2.6 2.75-4.25 5.25-4.25S12.65 11.4 13.25 14" />
    </svg>
  );
}
