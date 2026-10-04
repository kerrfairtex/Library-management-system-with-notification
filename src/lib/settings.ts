"use server";

import { db } from "./supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

export type SettingsCategory = "circulation" | "general";

export type CirculationSettings = {
  max_active_loans_per_member: number;
  loan_period_days: number;
  loan_period_options: number[];
  max_loan_days: number;
  overdue_fine_per_day: number;
  pickup_window_days: number;
  overdue_alert_cooldown_days: number;
  due_soon_window_days: number;
  max_renewal_days: number;
};

type SettingRow = {
  key: string;
  value: unknown;
  description: string | null;
  category: string;
  updated_at: string;
  updated_by: string | null;
};

const SETTINGS_CACHE = new Map<string, { data: unknown; expires: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCache(key: string): unknown | null {
  const cached = SETTINGS_CACHE.get(key);
  if (cached && cached.expires > Date.now()) {
    return cached.data;
  }
  return null;
}

function setCache(key: string, data: unknown): void {
  SETTINGS_CACHE.set(key, { data, expires: Date.now() + CACHE_TTL });
}

function clearCache(key?: string): void {
  if (key) {
    SETTINGS_CACHE.delete(key);
  } else {
    SETTINGS_CACHE.clear();
  }
}

async function fetchSettings(
  supabase: SupabaseClient,
  category?: string
): Promise<Record<string, unknown>> {
  let query = supabase.from("settings").select("key, value");
  if (category) {
    query = query.eq("category", category);
  }
  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch settings: ${error.message}`);
  
  const settings: Record<string, unknown> = {};
  for (const row of data ?? []) {
    settings[row.key] = row.value;
  }
  return settings;
}

export async function getSettings(
  supabase: SupabaseClient,
  category?: string
): Promise<Record<string, unknown>> {
  const cacheKey = `settings:${category ?? "all"}`;
  const cached = getCache(cacheKey);
  if (cached) return cached as Record<string, unknown>;
  
  const settings = await fetchSettings(supabase, category);
  setCache(cacheKey, settings);
  return settings;
}

export async function getCirculationSettings(
  supabase: SupabaseClient
): Promise<CirculationSettings> {
  const cacheKey = "circulation_settings";
  const cached = getCache(cacheKey);
  if (cached) return cached as CirculationSettings;
  
  const settings = await fetchSettings(supabase, "circulation");
  
  const defaults: CirculationSettings = {
    max_active_loans_per_member: 3,
    loan_period_days: 14,
    loan_period_options: [7, 14, 21, 30],
    max_loan_days: 60,
    overdue_fine_per_day: 5,
    pickup_window_days: 3,
    overdue_alert_cooldown_days: 4,
    due_soon_window_days: 3,
    max_renewal_days: 60,
  };
  
  const result: CirculationSettings = { ...defaults };
  for (const [settingKey, value] of Object.entries(settings)) {
    const settingKey = settingKey.replace("circulation.", "");
    if (settingKey in defaults) {
      if (Array.isArray(value)) {
        (result as Record<string, unknown>)[settingKey] = value;
      } else if (typeof value === "number") {
        (result as Record<string, unknown>)[settingKey] = value;
      } else if (typeof value === "string" && !isNaN(Number(value))) {
        (result as Record<string, unknown>)[settingKey] = Number(value);
      } else if (typeof value === "string" && value.startsWith("[")) {
        try {
          (result as Record<string, unknown>)[settingKey] = JSON.parse(value);
        } catch {
          // keep default
        }
      }
    }
  }
  
  setCache(cacheKey, result);
  return result;
}

export function invalidateSettingsCache(category?: string): void {
  if (category) {
    clearCache(`settings:${category}`);
    clearCache(category === "circulation" ? "circulation_settings" : undefined);
  } else {
    clearCache();
  }
}

export async function updateSetting(
  supabase: SupabaseClient,
  key: string,
  value: unknown,
  description: string | null,
  category: string,
  updatedBy: string
): Promise<void> {
  const { error } = await supabase
    .from("settings")
    .upsert({
      key,
      value,
      description,
      category,
      updated_by: updatedBy,
      updated_at: new Date().toISOString(),
    })
    .select();
  
  if (error) throw new Error(`Failed to update setting: ${error.message}`);
  
  // Invalidate cache
  invalidateSettingsCache(category);
}

export async function getSetting<T>(supabase: SupabaseClient, key: string, defaultValue: T): Promise<T> {
  const { data, error } = await supabase
    .from("settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  
  if (error) throw new Error(`Failed to fetch setting: ${error.message}`);
  if (!data) return defaultValue;
  
  try {
    return data.value as T;
  } catch {
    return defaultValue;
  }
}

// Sync function for backward compatibility with utils.ts constants
export async function getOverdueFinePerDay(supabase: SupabaseClient): Promise<number> {
  return getSetting(supabase, "circulation.overdue_fine_per_day", 5);
}

export async function getMaxActiveLoansPerMember(supabase: SupabaseClient): Promise<number> {
  return getSetting(supabase, "circulation.max_active_loans_per_member", 3);
}

export async function getDefaultLoanPeriodDays(supabase: SupabaseClient): Promise<number> {
  return getSetting(supabase, "circulation.loan_period_days", 14);
}

export async function getLoanPeriodOptions(supabase: SupabaseClient): Promise<number[]> {
  return getSetting(supabase, "circulation.loan_period_options", [7, 14, 21, 30]);
}

export async function getPickupWindowDays(supabase: SupabaseClient): Promise<number> {
  return getSetting(supabase, "circulation.pickup_window_days", 3);
}

export async function getOverdueAlertCooldownDays(supabase: SupabaseClient): Promise<number> {
  return getSetting(supabase, "circulation.overdue_alert_cooldown_days", 4);
}

export async function getDueSoonWindowDays(supabase: SupabaseClient): Promise<number> {
  return getSetting(supabase, "circulation.due_soon_window_days", 3);
}

export async function getMaxRenewalDays(supabase: SupabaseClient): Promise<number> {
  return getSetting(supabase, "circulation.max_renewal_days", 60);
}

export async function getMaxLoanDays(supabase: SupabaseClient): Promise<number> {
  return getSetting(supabase, "circulation.max_loan_days", 60);
}