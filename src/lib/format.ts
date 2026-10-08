import { formatInTimeZone } from "date-fns-tz";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { SHOP_TIMEZONE } from "./config";

export function formatMoney(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export function formatDate(date: Date | string | number, tz = SHOP_TIMEZONE): string {
  return formatInTimeZone(date, tz, "MM/dd/yyyy");
}

export function formatDateTime(date: Date | string | number, tz = SHOP_TIMEZONE): string {
  return formatInTimeZone(date, tz, "MM/dd/yyyy h:mm a");
}

export function formatPhone(e164: string): string {
  return parsePhoneNumberFromString(e164, "US")?.formatNational() ?? e164;
}

export function formatMiles(n: number): string {
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n)} mi`;
}

export function formatTime(date: Date | string | number, tz = SHOP_TIMEZONE): string {
  return formatInTimeZone(date, tz, "h:mm a");
}

export function formatRoNumber(n: number): string {
  return `RO-${String(n).padStart(5, "0")}`;
}

/** Parse US currency using integer arithmetic, including a single decimal digit. */
export function parseMoneyToCents(text: string): number | null {
  const match = /^\$?((?:\d{1,3}(?:,\d{3})+)|\d+)(?:\.(\d{1,2}))?$/.exec(text.trim());
  if (!match) return null;
  const cents = BigInt(match[1].replace(/,/g, "")) * BigInt(100) + BigInt((match[2] ?? "").padEnd(2, "0"));
  return cents <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(cents) : null;
}
