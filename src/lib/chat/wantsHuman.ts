// A visitor who asks for a person gets the email form straight away, without
// asking the model. Leaving it to the model's escalate_to_human call lost a
// lead in the chaykadental.com test: it wrote "a colleague will contact you"
// and stopped, so no form ever appeared. This only catches requests that
// can't mean anything else; everything subtler is still the model's call.

// Words for "a person", in Bulgarian (Cyrillic and typed in Latin letters) and English.
const PERSON =
  "(?:жив\\s+)?(?:човек|служител|служителка|оператор|консултант|администратор|колега|някого\\s+от\\s+екипа)" +
  "|(?:jiv\\s+|zhiv\\s+)?(?:chovek|sluzhitel|slujitel|operator|konsultant|kolega)" +
  "|(?:a\\s+|an\\s+|the\\s+)?(?:real\\s+|live\\s+)?(?:human|person|agent|representative|operator|someone|staff\\s+member|employee)";

const ASKS = [
  // "говоря с човек", "да се свържа с консултант", "govorq s chovek"
  `(?:говоря|разговарям|свържа|чуя|пиша|govorq|govoria|govorya|razgovarqm|svarzha|svurzha)\\s+(?:с|със|s|sas|sus)\\s+(?:${PERSON})`,
  // "свържете ме с оператор"
  `свържете\\s+ме\\s+(?:с|със)\\s+(?:${PERSON})`,
  // "искам човек", "дайте ми жив човек", "iskam chovek"
  `(?:искам|дайте\\s+ми|дай\\s+ми|трябва\\s+ми|iskam|daite\\s+mi|dai\\s+mi)\\s+(?:${PERSON})`,
  // "talk to a human", "speak with a real person", "connect me to an agent"
  `(?:talk|speak|chat)\\s+(?:to|with)\\s+(?:${PERSON})`,
  `connect\\s+me\\s+(?:to|with)\\s+(?:${PERSON})`,
  `(?:i\\s+want|i\\s+need|give\\s+me)\\s+(?:${PERSON})`,
];

// JS's \b doesn't know Cyrillic letters, so word edges are spelled out.
const ASK_RE = new RegExp(`(?<![\\p{L}\\p{N}])(?:${ASKS.join("|")})(?![\\p{L}\\p{N}])`, "iu");
// The whole message is just "a person" (maybe with "please"): "Оператор", "human please".
const ONLY_PERSON_RE = new RegExp(`^(?:${PERSON})(?:\\s+(?:моля|please|molq|molya))?$`, "iu");

export function wantsHuman(message: string): boolean {
  const text = message
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return false;
  return ONLY_PERSON_RE.test(text) || ASK_RE.test(text);
}
