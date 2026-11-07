// Whether text typed in search is a question for Ask Kosha. It is pure, so core.test.ts can check it.
import { getLocale } from "../paraglide/runtime.js"

/**
 * Question words per language. Every language counts whatever the UI language is. `start` words open a
 * question; `word` words mark one anywhere, for languages that put the question word mid-sentence (Hindi,
 * the Russian "ли"); `part` marks one anywhere inside the text, for scripts written without spaces or with
 * attached endings. `plain` lists words that are ordinary in that language ("dove" is soap in English and
 * "where" in Italian); they don't count while that language is the UI language.
 */
type Words = { start?: string; word?: string; part?: string; plain?: string[] }
const WORDS: Record<string, Words> = {
  en: {
    start:
      "how|what|when|where|why|which|who|whose|did|do|does|am|is|are|was|were|have|has|can|could|should|will|would|show|list|compare|tell",
    plain: ["dove", "dime"],
  },
  de: {
    start:
      "wie|wann|wo|wofür|wohin|woher|warum|wieso|weshalb|welche[rsnm]?|wer|was|wieviel|habe?|hatte|bin|ist|sind|war|kann|soll|zeige?|liste|vergleiche?|gib|gibt",
  },
  es: {
    start:
      "qu[eé]|cu[aá]nt[oa]s?|cu[aá]ndo|d[oó]nde|ad[oó]nde|por ?qu[eé]|cu[aá]l(es)?|qui[eé]n(es)?|c[oó]mo|mu[eé]strame|muestra|lista|compara|dime|puedo|tengo",
  },
  fr: {
    start:
      "combien|quand|o[uù]|pourquoi|quel(le)?s?|qui|que|qu['’]\\p{L}+|quoi|comment|est-ce|ai-je|montre(-moi)?|affiche|liste|compare|dis-moi|donne(-moi)?",
  },
  it: {
    start:
      "quant[oaie]|quando|dove|dov['’]\\p{L}*|perch[eé]|qual[ei]?|chi|cosa|cos['’]\\p{L}*|che|come|mostra(mi)?|elenca|confronta|dimmi|posso",
  },
  pt: {
    start:
      "quant[oa]s?|quando|onde|aonde|por ?qu[eê]|porque|qual|quais|quem|o qu[eê]|como|cad[eê]|mostr[ea](-me)?|me mostr[ae]|lista|liste|compar[ea]|me diga|diga|posso|tenho",
  },
  nl: {
    start:
      "hoe|wat|wanneer|waar|waarom|waarvoor|welke?|wie|hoeveel|heb|hebben|heeft|ben|is|zijn|was|waren|kan|kun|kunnen|moet|toon|laat|geef|vergelijk",
  },
  ru: {
    start:
      "сколько|когда|где|куда|откуда|почему|зачем|как\\p{L}*|кто|что|чего|чем|покажи(те)?|сравни(те)?|перечисли(те)?|скажи(те)?|могу|есть|был[аио]?",
    word: "ли",
  },
  hi: {
    word: "क्या|कितन[ाेी]|कब|कहा[ँं]|क्यों|कौन(सा|-सा)?|कैस[ेा]|दिखाओ|दिखाइए|दिखाएं|दिखाएँ|बताओ|बताइए|बताएं|बताएँ|kya|kitn[aei]|kab|kahan|kyun|kyon|kaise|kaun|batao|dikhao",
  },
  ja: {
    part: "いくら|何|なに|いつ|どこ|なぜ|なんで|どれ|どの|誰|だれ|教えて|見せて|比べ|か$",
    plain: ["多少"],
  },
  zh: {
    part: "多少|什[么麼]|甚么|怎[么麼]|怎[样樣]|[为為]什[么麼]|哪|谁|誰|几[个個次笔筆天月]|[吗嗎呢]$|是否|有没有|有沒有|是不是|[显顯]示|列出|告[诉訴]我|[给給]我看",
    plain: ["何"],
  },
  ko: {
    part: "얼마|뭐|무엇|무슨|언제|어디|왜|어떻게|어떤|누구|몇|보여|알려|비교|(까|까요|나요|니|냐)$",
  },
}

// A word ends where letters and vowel signs stop (JavaScript's \b only knows ASCII).
const END = "(?![\\p{L}\\p{M}])"
const compile = (pick: (w: Words) => string | undefined, wrap: (s: string) => string) =>
  Object.values(WORDS).flatMap((w) => {
    const s = pick(w)
    return s ? [new RegExp(wrap(s.normalize("NFKC")), "giu")] : []
  })
const RULES = [
  ...compile(
    (w) => w.start,
    (s) => `^(?:${s})${END}`
  ),
  ...compile(
    (w) => w.word,
    (s) => `(?<![\\p{L}\\p{M}])(?:${s})${END}`
  ),
  ...compile(
    (w) => w.part,
    (s) => s
  ),
]

/** A question: a `?` (or `？`), a leading `¿`, or a question word in any of Kosha's languages. */
export function isQuestion(text: string, locale: string = getLocale()) {
  const t = text.normalize("NFKC").trim().toLowerCase()
  if (/[?¿]/.test(t)) return true
  const plain = WORDS[locale]?.plain ?? []
  return RULES.some((re) => [...t.matchAll(re)].some((m) => !plain.includes(m[0])))
}
