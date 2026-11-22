# Archived SQL — historical, do not run

These one-off scripts were applied by hand to older databases while the
schema was being built. They are kept for reference only: what each did is
already part of the live database, and several overlap or conflict with
each other and with the current migrations (for example
`SUPABASE_CONFIG_FIX_CORRECTED.sql` creates API policies that
`security/20261123_core_tables_lockdown.sql` deliberately disables, and
`trac_library_schema.sql` targets the old `trac_library` schema the app no
longer uses).

| File | Was |
|---|---|
| `COMPLETE_SCHEMA_MIGRATION.sql` | An all-in-one schema snapshot (superseded by `../schema.sql`) |
| `KOHA_UPGRADE_MIGRATION.sql` | Older copy of `../koha-upgrade.sql` |
| `CRITICAL_DB_FIX.sql`, `MISSING_COLUMNS_MIGRATION.sql` | Hotfixes for missing columns, incl. `members.user_id` |
| `SUPABASE_CONFIG_FIX_CORRECTED.sql` | Old RLS/API policies (now inert after the lockdown) |
| `check_rls.sql` | Ad-hoc RLS inspection query |
| `trac_library_schema.sql` | Schema for the old separate `trac_library` schema |

For a new database follow the order in the project README. For what has
been applied to production, see `docs/migrations-applied.md`.
