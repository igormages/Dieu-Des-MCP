import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseCookieImportRaw } from "./cookie-import";

describe("cookie-import", () => {
  it("parse un fichier Netscape minimal", () => {
    const raw = [
      "# Netscape",
      ".leclercdrive.fr\tTRUE\t/\tTRUE\t0\tdatadome\tabc123",
      "fd9-courses.leclercdrive.fr\tFALSE\t/\tTRUE\t0\tASP.NET_SessionId\txyz",
    ].join("\n");
    const jar = parseCookieImportRaw(raw);
    assert.equal(jar["leclercdrive.fr"]?.datadome, "abc123");
    assert.equal(jar["fd9-courses.leclercdrive.fr"]?.["ASP.NET_SessionId"], "xyz");
    assert.ok(jar["fd9-secure.leclercdrive.fr"]?.["ASP.NET_SessionId"]);
  });
});
