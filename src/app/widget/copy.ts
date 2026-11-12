// The chat window's own texts, in English and Bulgarian. The answers already
// follow the visitor's language (see buildSystemPrompt); this keeps the
// buttons and the hand-off form from switching back to English around them.

export type WidgetLang = "en" | "bg";

const CYRILLIC = /[Ѐ-ӿ]/;

/**
 * Bulgarian when the visitor writes in Cyrillic; otherwise the site's own
 * language (the greeting the business set), then the browser's.
 */
export function pickLang(latestVisitorText: string | null, greeting: string, browserLang: string): WidgetLang {
  if (latestVisitorText && CYRILLIC.test(latestVisitorText)) return "bg";
  if (CYRILLIC.test(greeting)) return "bg";
  return browserLang.toLowerCase().startsWith("bg") ? "bg" : "en";
}

export const COPY = {
  en: {
    subtitle: "AI assistant · replies instantly",
    typing: "Assistant is typing",
    question: "Your question",
    placeholder: "Ask a question…",
    send: "Send",
    sending: "Sending…",
    talkToPerson: "Talk to a person",
    email: "Email",
    note: "Note",
    notePlaceholder: "Anything else to add? (optional)",
    keepChatting: "No thanks, keep chatting",
    tryAgain: "Something went wrong. Please try again.",
    thanks: "Thanks, you're all set",
    followUp: (email: string) => `A person from our team will follow up at ${email}.`,
    backToChat: "Back to chat",
    reasons: {
      model_requested: "This one needs a person. Leave your email and our team will follow up.",
      user_requested: "Leave your email and a person from our team will follow up.",
      quota: "Our assistant is very busy right now. Leave your email and we'll get back to you.",
      provider_exhausted: "Our assistant is very busy right now. Leave your email and we'll get back to you.",
      error: "Something went wrong on our side. Leave your email and a person will follow up.",
    } as Record<string, string>,
  },
  bg: {
    subtitle: "AI асистент · отговаря веднага",
    typing: "Асистентът пише",
    question: "Вашият въпрос",
    placeholder: "Задайте въпрос…",
    send: "Изпрати",
    sending: "Изпращане…",
    talkToPerson: "Свържете се с човек",
    email: "Имейл",
    note: "Бележка",
    notePlaceholder: "Нещо друго? (по желание)",
    keepChatting: "Не, благодаря",
    tryAgain: "Нещо се обърка. Опитайте отново.",
    thanks: "Благодарим, получихме го",
    followUp: (email: string) => `Колега от екипа ще ви пише на ${email}.`,
    backToChat: "Обратно към чата",
    reasons: {
      model_requested: "Тук е нужен колега. Оставете имейл и ще се свържем с вас.",
      user_requested: "Оставете имейл и колега от екипа ще се свърже с вас.",
      quota: "В момента асистентът е много зает. Оставете имейл и ще ви пишем.",
      provider_exhausted: "В момента асистентът е много зает. Оставете имейл и ще ви пишем.",
      error: "Нещо се обърка при нас. Оставете имейл и колега ще се свърже с вас.",
    } as Record<string, string>,
  },
} satisfies Record<WidgetLang, unknown>;

export type WidgetCopy = (typeof COPY)[WidgetLang];
