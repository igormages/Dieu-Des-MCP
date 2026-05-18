import { importBiocoopCookies } from "./client";

export async function importBiocoopCookiesFromRaw(raw: string) {
  return importBiocoopCookies(raw);
}
