import type { Database } from "@/lib/database.types";

export type Customer = Database["public"]["Tables"]["customers"]["Row"];
export type Vehicle = Database["public"]["Tables"]["vehicles"]["Row"];
export type Appointment = Database["public"]["Tables"]["appointments"]["Row"];
export type Activity = Database["public"]["Tables"]["activities"]["Row"];

export function customerName(c: Pick<Customer, "type" | "first_name" | "last_name" | "company_name">): string {
  const person = [c.first_name, c.last_name].filter(Boolean).join(" ");
  if (c.type === "business") return c.company_name || person;
  return person || c.company_name || "";
}

export function vehicleLabel(v: Pick<Vehicle, "year" | "make" | "model" | "trim">): string {
  return [v.year, v.make, v.model, v.trim].filter(Boolean).join(" ");
}
