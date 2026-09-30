import { supabase } from "@/integrations/supabase/client";

// Phone players have a synthetic user_id of the form:
// 00000000-0000-0000-0000-<12 digits>  (left-padded phone digits)
const PHONE_UUID_PREFIX = "00000000-0000-0000-0000-";

export function isPhoneUserId(userId: string): boolean {
  return typeof userId === "string" && userId.startsWith(PHONE_UUID_PREFIX);
}

/** Returns canonical phone digits (leading zeros stripped) or null if not a phone user. */
export function phoneFromUserId(userId: string): string | null {
  if (!isPhoneUserId(userId)) return null;
  const digits = userId.slice(PHONE_UUID_PREFIX.length).replace(/\D/g, "");
  const trimmed = digits.replace(/^0+/, "");
  return trimmed || digits;
}

/** Normalize a phone string the way `phoneToUserId` does in the webhook. */
export function normalizePhone(phone: string): string {
  const digits = (phone || "").replace(/\D/g, "");
  return digits.replace(/^0+/, "") || digits;
}

/** Returns an Israeli-formatted phone string when possible, otherwise the input. */
export function formatPhone(phone: string): string {
  const digits = (phone || "").replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("0")) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 9 && digits.startsWith("5")) {
    return `0${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
  }
  return phone;
}

export type RosterMap = Map<string, string>;

/** Fetch roster name lookup map keyed by normalized phone digits. */
export async function fetchRosterMap(phones: string[]): Promise<RosterMap> {
  const map: RosterMap = new Map();
  const unique = [...new Set(phones.filter(Boolean))];
  if (unique.length === 0) return map;

  // Generate variants (with and without leading 0) so any stored format matches.
  const variants = new Set<string>();
  for (const p of unique) {
    variants.add(p);
    variants.add(`0${p}`);
    variants.add(p.replace(/^0+/, ""));
  }

  const { data, error } = await supabase
    .from("player_roster")
    .select("phone_number, player_name")
    .in("phone_number", [...variants]);

  if (error) {
    console.error("fetchRosterMap error", error);
    return map;
  }
  for (const row of data || []) {
    const norm = normalizePhone(row.phone_number);
    map.set(norm, row.player_name);
  }
  return map;
}

/** Lookup a name from the roster map for any user_id. */
export function rosterNameForUser(userId: string, roster: RosterMap): string | null {
  const phone = phoneFromUserId(userId);
  if (!phone) return null;
  return roster.get(normalizePhone(phone)) || null;
}
