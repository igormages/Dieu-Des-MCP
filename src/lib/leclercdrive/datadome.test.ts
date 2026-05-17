import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  detectDataDomeBlock,
  hasDatadomeCookie,
  parseBrowserCookieImport,
} from "./datadome";

describe("leclercdrive datadome", () => {
  it("détecte une redirection captcha", () => {
    assert.equal(
      detectDataDomeBlock(
        "https://geo.captcha-delivery.com/captcha/?initialCid=abc",
        200,
        ""
      ),
      true
    );
  });

  it("parse une valeur datadome seule", () => {
    const jar = parseBrowserCookieImport("wSwoq_1FEL~ABaZItyYgg");
    assert.equal(jar["leclercdrive.fr"].datadome, "wSwoq_1FEL~ABaZItyYgg");
    assert.equal(hasDatadomeCookie(jar), true);
  });

  it("parse une chaîne multi-cookies", () => {
    const jar = parseBrowserCookieImport("datadome=abc; ASP.NET_SessionId=xyz");
    assert.equal(jar["leclercdrive.fr"].datadome, "abc");
    assert.equal(jar["leclercdrive.fr"]["ASP.NET_SessionId"], "xyz");
  });
});
