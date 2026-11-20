/*
 * Shared UI kit. Pages build from these instead of one-off markup so
 * colour, spacing, focus and states stay consistent. Styles live in
 * src/app/globals.css (design tokens on :root, component classes below).
 */
export { Button, ButtonLink, ButtonAnchor, buttonClass, type ButtonVariant } from "./Button";
export { Card } from "./Card";
export { Badge } from "./Badge";
export { StatCard, StatGrid, KpiRow, type Kpi } from "./StatCard";
export { Table, type Column } from "./Table";
export { FormField } from "./FormField";
export { Modal, useDialogs } from "./Modal";
export { EmptyState } from "./EmptyState";
export { ErrorState, Notice } from "./ErrorState";
export { PageHeader } from "./PageHeader";
export { ErrorScreen } from "./ErrorScreen";
