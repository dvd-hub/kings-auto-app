import en from "../../messages/en.json";
import es from "../../messages/es.json";

export async function getAppMessages(locale: "en" | "es") {
  return locale === "es" ? es : en;
}
