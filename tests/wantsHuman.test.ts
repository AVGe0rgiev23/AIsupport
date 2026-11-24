import { describe, expect, it } from "vitest";
import { wantsHuman } from "@/lib/chat/wantsHuman";

// Asking for a person must open the email form every time. In the
// chaykadental.com test the model answered "a colleague will contact you" and
// never called escalate_to_human, so no form appeared and the lead was lost.
describe("wantsHuman", () => {
  it.each([
    "Искам да говоря с човек",
    "искам да говоря с човек!",
    "Може ли да говоря със служител?",
    "Свържете ме с оператор",
    "Искам да се свържа с консултант",
    "Дайте ми жив човек",
    "искам човек",
    "Оператор",
    "човек моля",
    "iskam da govorq s chovek",
    "moje li da govoria sas sluzhitel",
    "I want to talk to a human",
    "Can I speak with a real person?",
    "connect me to an agent please",
    "human",
    "Agent!",
  ])("recognises %j", (text) => {
    expect(wantsHuman(text)).toBe(true);
  });

  it.each([
    "Колко струва преглед?",
    "Колко човека работят при вас?",
    "Имате ли оператор на камера за сватби?",
    "Човекът от рецепцията каза, че е 20 евро",
    "Can a person park outside?",
    "Is this a human-made product?",
    "What does your support agent software cost?",
    "",
  ])("leaves %j to the assistant", (text) => {
    expect(wantsHuman(text)).toBe(false);
  });
});
