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
