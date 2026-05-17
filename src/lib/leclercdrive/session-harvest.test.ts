import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { playwrightCookiesToJar } from "./session-harvest";

describe("session-harvest", () => {
  it("groupe les cookies par host leclercdrive", () => {
    const jar = playwrightCookiesToJar([
      { name: "datadome", value: "abc", domain: ".leclercdrive.fr" },
      { name: "ASP.NET_SessionId", value: "xyz", domain: "fd9-courses.leclercdrive.fr" },
    ]);
    assert.equal(jar["leclercdrive.fr"].datadome, "abc");
    assert.equal(jar["fd9-courses.leclercdrive.fr"]["ASP.NET_SessionId"], "xyz");
  });
});
