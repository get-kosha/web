// Quick add (⌘K) parses one line of text into a transaction as you type. It is pure, so core.test.ts can check it.
import { cleanTag } from "./core.ts"
import { getLocale } from "../paraglide/runtime.js"

export type QuickParse = {
  /** Cents, always positive; `income` carries the sign. */
  amount: number | null
  income: boolean
  /** "today" | "yesterday" when typed (in any language Kosha speaks), else null. */
  date: "today" | "yesterday" | null
  walletId: string | null
  categoryId: string | null
  payee: string
  /** Words typed as #hashtags, cleaned as stored. */
  tags: string[]
  /** A currency sign or unit was typed (€12, 9000원, 35元), so the account's own currency may not apply. */
  currency: boolean
}

/**
 * The words quick add knows, per language. Every language's words work whatever the UI language is,
 * since a German user types German in an English UI. `plain` lists words that are ordinary in that
 * language but mean something in another ("hier" is French for yesterday and German for here); they
 * stay ordinary while that language is the UI language.
 * `sentence` words, left over in the payee, mean the line is a sentence for AI to read: links, verbs,
 * relative days, weekdays, months, money words. They match whole words, except in Japanese, Chinese
 * and Korean, which write words together or attach particles, so there a marker counts inside a word.
 */
type Words = { today: string[]; yesterday: string[]; sentence: string; plain?: string[] }
const WORDS: Record<string, Words> = {
  en: {
    today: ["today", "tdy"],
    yesterday: ["yesterday", "yday", "yest"],
    sentence:
      "at|for|from|with|on|in|via|by|and|paid|pay|spent|spend|bought|got|received|refund|refunded|split|last|ago|this|next|tomorrow|tonight|morning|noon|evening|week|month|(mon|tues?|wed(nes)?|thu(rs)?|fri|satur|sun)(day)?|jan(uary)?|feb(ruary)?|march|april|june|july|aug(ust)?|sept?(ember)?|oct(ober)?|nov(ember)?|dec(ember)?|\\d+(st|nd|rd|th|am|pm)|\\d{1,2}:\\d{2}|eur|usd|gbp|inr|chf|jpy|aud|cad|sgd|aed|bucks|euros?|dollars?|pounds?|quid|rupees?",
    plain: ["met", "mars"],
  },
  de: {
    today: ["heute", "heut"],
    yesterday: ["gestern"],
    sentence:
      "am|um|für|von|vom|mit|bei|beim|im|über|und|bezahlt|gezahlt|ausgegeben|gekauft|bekommen|erhalten|erstattet|erstattung|geteilt|letzte[nrs]?|vor|diese[nrs]?|nächste[nrs]?|morgen|übermorgen|vorgestern|abends?|morgens|mittags?|tage?n?|woche|monat|(mon|diens|donners|frei|sams|sonn)tag|mittwoch|januar|februar|märz|mai|juni|juli|oktober|dezember|uhr|franken|rupien",
    plain: ["hier"],
  },
  es: {
    today: ["hoy"],
    yesterday: ["ayer"],
    sentence:
      "con|para|por|en|desde|pagu[eé]|pagad[oa]|gast[eé]|gastad[oa]|compr[eé]|comprad[oa]|recib[ií]|recibid[oa]|reembolso|devoluci[oó]n|dividid[oa]|pasad[oa]|[uú]ltim[oa]|pr[oó]xim[oa]|est[ea]|ma[nñ]ana|anoche|anteayer|antier|tarde|noche|mediod[ií]a|hace|d[ií]as|semana|mes|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|enero|febrero|marzo|abril|mayo|junio|julio|agosto|sep?tiembre|octubre|noviembre|diciembre|pesos|d[oó]lares|pavos",
  },
  fr: {
    today: ["aujourd'hui", "aujourd’hui", "auj"],
    yesterday: ["hier"],
    sentence:
      "avec|pour|par|en|et|pay[ée]e?|d[ée]pens[ée]e?|achet[ée]e?|re[çc]ue?|rembours[ée]e?|remboursement|partag[ée]e?|derni[eè]re?|prochaine?|demain|avant-hier|soir|matin|midi|semaine|mois|jours|(lun|mar|mercre|jeu|vendre|same)di|dimanche|janvier|f[ée]vrier|mars|avril|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[ée]cembre|balles",
    plain: ["mes"],
  },
  it: {
    today: ["oggi"],
    yesterday: ["ieri"],
    sentence:
      "con|per|pagat[oaie]|spes[oi]|comprat[oaie]|ricevut[oaie]|rimbors[oa]|rimborsat[oaie]|divis[oa]|scors[oa]|prossim[oa]|domani|dopodomani|(l['’])?altroieri|l['’]altro|stasera|stamattina|stamani|mattina|sera|pomeriggio|settimana|mese|giorni|(lune|marte|mercole|giove|vener)d[iì]|sabato|domenica|gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre",
  },
  pt: {
    today: ["hoje", "hj"],
    yesterday: ["ontem"],
    sentence:
      "com|para|pra|por|em|paguei|pago|gastei|comprei|comprad[oa]|recebi|recebid[oa]|reembolso|estorno|dividid[oa]|passad[oa]|[uú]ltim[oa]|pr[oó]xim[oa]|amanh[aã]|anteontem|semana|m[eê]s|dias|atr[aá]s|(segunda|ter[cç]a|quarta|quinta|sexta)(-feira)?|s[aá]bado|domingo|janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|reais",
  },
  nl: {
    today: ["vandaag"],
    yesterday: ["gisteren", "gister"],
    sentence:
      "met|voor|bij|op|en|om|betaald|uitgegeven|gekocht|gekregen|ontvangen|terugbetaald|terugbetaling|gedeeld|vorige?|afgelopen|volgende?|morgen|overmorgen|eergisteren|vanavond|vanochtend|vanmorgen|vanmiddag|ochtend|middag|avond|maand|dagen|geleden|uur|(maan|dins|woens|donder|vrij|zater|zon)dag|januari|februari|maart|mei|augustus|oktober",
    plain: ["hier"],
  },
  ru: {
    today: ["сегодня"],
    yesterday: ["вчера"],
    sentence:
      "в|во|на|с|со|за|для|и|от|из|через|(за|о)?платил[аи]?|потратил[аи]?|купил[аи]?|получил[аи]?|вернул[аи]?|возврат|пополам|прошл\\p{L}*|следующ\\p{L}*|эт(от|у|ой|а)|завтра|позавчера|вечером|утром|днём|днем|недел\\p{L}*|месяц\\p{L}*|дн(я|ей)|назад|час(а|ов)?|понедельник|вторник|сред[аеуы]|четверг|пятниц[аеуы]|суббот[аеуы]|воскресень[еяю]|январ[ья]|феврал[ья]|марта?|апрел[ья]|ма[йя]|июн[ья]|июл[ья]|августа?|сентябр[ья]|октябр[ья]|ноябр[ья]|декабр[ья]|евро|долл\\p{L}*|бакс\\p{L}*",
  },
  // Hindi has only "today": "कल" (and "kal" in Latin letters) means both yesterday and tomorrow, so it goes to AI.
  hi: {
    today: ["आज", "aaj"],
    yesterday: [],
    sentence:
      "में|से|को|के|का|की|और|लिए|साथ|पर|ख़?र्च[ाे]?|दिए|दिया|दी|मिले|मिला|मिली|ख़?रीद[ाे]|भुगतान|वापस|रिफंड|पिछल[ेा]|अगल[ेा]|परसों|कल|सुबह|शाम|रात|दोपहर|हफ़?्त[ेा]|सप्ताह|महीन[ेा]|दिन|पहले|बजे|(सोम|मंगल|बुध|गुरु|बृहस्पति|शुक्र|शनि|रवि)वार|जनवरी|फ़?रवरी|मार्च|अप्रैल|मई|जून|जुलाई|अगस्त|सित(ं|म्)बर|अक्[टत]ूबर|नव(ं|म्)बर|दिस(ं|म्)बर|डॉलर|kal|parso",
  },
  ja: {
    today: ["今日", "きょう", "本日"],
    yesterday: ["昨日", "きのう"],
    sentence:
      "で|払[っい]|支払|買っ|使っ|もらっ|貰っ|返金|割り?勘|先週|来週|今週|先月|来月|今月|明日|あした|一昨日|おととい|今朝|今夜|昨夜|曜|ドル|ユーロ",
  },
  zh: {
    today: ["今天", "今日"],
    yesterday: ["昨天", "昨日"],
    sentence:
      "花了|付了|[买買]了|[给給]了|收到|退款|退了|平分|在(?![线線])|上[周週]|下[周週]|本[周週]|[这這][周週]|上[个個]月|下[个個]月|明天|前天|今晚|昨晚|早上|晚上|中午|下午|上午|[周週][一二三四五六日天]|星期|礼拜|禮拜|美元|[欧歐]元",
  },
  ko: {
    today: ["오늘"],
    yesterday: ["어제"],
    sentence:
      "에서|이랑|하고|한테|에게|샀[어다음]|썼[어다음]|냈[어다음]|결제|받았|환불|더치|나눠|지난|다음|이번|내일|그저께|그제|오전|오후|[월화수목금토일]요일|달러|유로",
  },
}
const ATTACHED = ["ja", "zh", "ko"]
// Chinese, Japanese and Korean pack a category into two characters (外食, 餐饮, 급여) and need no spaces.
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u

const DATES = new Map<string, "today" | "yesterday">()
for (const w of Object.values(WORDS)) {
  for (const d of w.today) DATES.set(d.normalize("NFKC"), "today")
  for (const d of w.yesterday) DATES.set(d.normalize("NFKC"), "yesterday")
}
// Longest first, so 一昨日 is never read as 昨日.
const CJK_DATES = [...DATES.keys()].filter((w) => CJK.test(w)).sort((a, b) => b.length - a.length)
const sentence = (langs: string[]) =>
  langs
    .map((l) => WORDS[l].sentence)
    .join("|")
    .normalize("NFKC")
const SPACED = new RegExp(`^(${sentence(Object.keys(WORDS).filter((l) => !ATTACHED.includes(l)))})$`, "iu")
const JOINED = new RegExp(sentence(ATTACHED), "iu")

// Currency signs, and the units people write after a number (1200円, 35元, 9000원, 500₽, 50रु).
const SIGN = "R\\$|US\\$|[€$£₹¥₩₽]"
const UNIT =
  "円|元|块钱?|塊錢?|원|ドル|ユーロ|美元|[欧歐]元|달러|유로|руб(?:лей|ля|ль)?\\.?|р\\.?|रु\\.?|रू\\.?|रुपये|रुपए|रुपया"
// 3万 and 5천 are 30,000 and 5,000.
const MULT: Record<string, number> = { 万: 1e4, 萬: 1e4, 만: 1e4, 千: 1e3, 천: 1e3 }
// A number with `.` or `,` decimals and optional grouping: 1.234,56, 1,234.56, 1'234.50, 1,00,000 (Indian lakh).
// Three digits after a separator always group thousands, since no currency here has three decimals.
const NUMBER = "\\d+|[1-9]\\d{0,2}(?:([.,'’])\\d{3})(?:\\3\\d{3})*|[1-9]\\d?(?:,\\d\\d)+,\\d{3}"
const MONEY = new RegExp(`^([+-])?(?:${SIGN})?(${NUMBER})(?:[.,](\\d{1,2}))?([万萬만千천])?(${SIGN}|${UNIT})?$`, "iu")
const CURRENCY_ONLY = new RegExp(`^(${SIGN}|${UNIT})$`, "iu")
const MONEY_END = new RegExp(`(${SIGN}|${UNIT})$`, "iu")
const RUN = new RegExp(`[+-]?(?:${SIGN})?\\d[\\d.,'’]*[万萬만千천]?(?:${SIGN}|${UNIT})?`, "giu")

// Full-width forms (１２，５０ ＃旅行) become plain, and Devanagari digits become 0-9.
const normalize = (q: string) => q.normalize("NFKC").replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 0x966))
const bare = (w: string) => w.toLowerCase().replace(/^\p{P}+|\p{P}+$/gu, "")

/**
 * Splits words in scripts written without spaces: a number at the end of a run of text or closed by a
 * currency ("午饭35", "35元午饭", "점심9000원", but not "11月3日"), then a date word at either end ("昨天午饭").
 */
function splitJoined(t: string): string[] {
  if (!CJK.test(t)) return [t]
  const parts: string[] = []
  let at = 0
  for (const m of t.matchAll(RUN)) {
    const end = m.index + m[0].length
    const before = t[m.index - 1] ?? ""
    if ((end < t.length && !MONEY_END.test(m[0])) || /\d/.test(before) || before in MULT) continue
    parts.push(t.slice(at, m.index), m[0])
    at = end
  }
  parts.push(t.slice(at))
  return parts.filter(Boolean).flatMap(splitDate)
}
function splitDate(t: string): string[] {
  // A sentence keeps its date word, since AI reads it whole (一昨日 is not 昨日).
  if (!CJK.test(t) || JOINED.test(t)) return [t]
  for (const w of CJK_DATES) {
    if (t === w) return [t]
    if (t.startsWith(w)) return [w, ...splitDate(t.slice(w.length))]
    if (t.endsWith(w)) return [...splitDate(t.slice(0, -w.length)), w]
  }
  return [t]
}
const tokenize = (q: string) =>
  normalize(q)
    .split(/[\s、。]+/)
    .filter(Boolean)
    .flatMap(splitJoined)

/** Whether `word` (bare) is ordinary in the UI language, whatever it means in another. */
const plain = (word: string, locale: string) => WORDS[locale]?.plain?.includes(word) ?? false

function dateOf(word: string, locale: string) {
  if (plain(word, locale)) return null
  const own = WORDS[locale]
  if (own?.today.includes(word)) return "today"
  if (own?.yesterday.includes(word)) return "yesterday"
  return DATES.get(word) ?? null
}

/**
 * `#word` is a tag. The first number is the amount, written the way any of Kosha's languages writes it
 * (12,50, 1.234,56, 1,00,000, ¥1200, 9000원, 3万), with a leading `+` for income.
 * `today` or `yesterday`, in any language Kosha speaks, sets the date. A word equal to an account's name or its
 * first word sets the account.
 * A word of 3 or more letters (2 in Chinese, Japanese or Korean) that starts a category name sets the category. The remaining words are the payee.
 */
export function parseQuickAdd(
  q: string,
  wallets: { id: string; name: string }[],
  categories: { id: string; name: string }[],
  locale: string = getLocale()
): QuickParse {
  const out: QuickParse = {
    amount: null,
    income: false,
    date: null,
    walletId: null,
    categoryId: null,
    payee: "",
    tags: [],
    currency: false,
  }
  const words: string[] = []
  for (const t of tokenize(q)) {
    const low = bare(t)
    if (t.startsWith("#")) {
      const tag = cleanTag(t)
      if (tag && !out.tags.includes(tag)) out.tags.push(tag)
      continue
    }
    const money = out.amount === null ? MONEY.exec(t.replace(/[.,]$/, "")) : null
    if (money) {
      const [, sign, whole, , cents, mult, unit] = money
      const value = parseFloat(`${whole.replace(/[.,'’]/g, "")}.${cents ?? 0}`) * (mult ? MULT[mult] : 1)
      out.amount = Math.round(value * 100)
      out.income = sign === "+"
      out.currency ||= unit !== undefined || /^[+-]?[^\d+-]/.test(t)
      continue
    }
    if (CURRENCY_ONLY.test(t)) {
      out.currency = true
      continue
    }
    const date = out.date ? null : dateOf(low, locale)
    if (date) {
      out.date = date
      continue
    }
    const w = out.walletId
      ? null
      : wallets.find((x) => {
          const n = x.name.toLowerCase()
          return n === low || n.split(/\s+/)[0] === low
        })
    if (w) {
      out.walletId = w.id
      continue
    }
    // Vowel signs (Devanagari, Hangul jamo) are marks, not letters.
    const letters = [...low.replace(/\p{M}/gu, "")].length
    const c =
      out.categoryId || letters < (CJK.test(low) ? 2 : 3)
        ? null
        : categories.find((x) => x.name.toLowerCase().startsWith(low))
    if (c) {
      out.categoryId = c.id
      continue
    }
    words.push(t)
  }
  out.payee = words.join(" ")
  return out
}

/**
 * Whether quick add should ask AI to read the line. Lines the local parser explains in full
 * ("24.90 pizza hut yesterday visa") stay local and instant. A sentence goes to AI: a leftover word
 * like "with", "viernes" or "eur" (see WORDS), a currency, digits inside the payee, a long payee, or no
 * amount in three or more words.
 * ponytail: words outside WORDS (slang, misspellings, dialects) and Korean particles after a payee
 * ("스타벅스에서") are not stripped, so with AI off they stay in the payee. "1 200" with a space as the
 * thousands separator (French, Russian) and spelled-out numbers ("zwölf", "1만5천") go to AI.
 */
export function needsAi(q: string, p: QuickParse, locale: string = getLocale()) {
  const tokens = tokenize(q)
  if (tokens.length < 2) return false
  const words = p.payee.split(/\s+/).map(bare).filter(Boolean)
  return (
    p.currency ||
    words.some(
      (w) => /[\d€$£₹¥₩₽]/.test(w) || (!plain(w, locale) && (SPACED.test(w) || (CJK.test(w) && JOINED.test(w))))
    ) ||
    words.length > 3 ||
    (p.amount === null && tokens.length >= 3)
  )
}
