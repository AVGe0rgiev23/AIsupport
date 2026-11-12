import { describe, expect, it } from "vitest";
import { COPY, pickLang } from "@/app/widget/copy";

describe("widget language", () => {
  it("is Bulgarian when the visitor writes in Cyrillic", () => {
    expect(pickLang("Какво работно време имате?", "Hi! How can I help?", "en-US")).toBe("bg");
  });
  it("follows the site's greeting, then the browser, for Latin text", () => {
    expect(pickLang("kakvo struva montaja?", "Здравейте! С какво да помогна?", "en-US")).toBe("bg");
    expect(pickLang(null, "Hi!", "bg-BG")).toBe("bg");
    expect(pickLang("Do you speak English?", "Hi!", "en-GB")).toBe("en");
  });
  it("has every text in both languages", () => {
    expect(Object.keys(COPY.bg).sort()).toEqual(Object.keys(COPY.en).sort());
    expect(Object.keys(COPY.bg.reasons).sort()).toEqual(Object.keys(COPY.en.reasons).sort());
  });
});
