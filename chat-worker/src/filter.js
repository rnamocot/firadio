// FilRadio chat filter: profanity / sexual / slur / spam detection (English, Tagalog, Bisaya).
// Runs on the server, so it can't be bypassed by editing the page.
// Add words without redeploying via the admin endpoint (see README.md, "addword").

// Matched anywhere inside a word ("fucking", "putanginamo", "kinantot").
// Only words that are never part of an innocent word go here.
const SUBSTR = [
  // English
  "fuck", "fuk", "fck", "fvck", "phuck", "shit", "bitch", "biatch", "cunt", "pussy", "whore", "slut", "nigg", "nigga",
  "faggot", "fagot", "asshole", "ashole", "motherf", "dickhead", "blowjob", "handjob", "jizz", "dildo", "porn", "p0rn",
  "masturbat", "orgasm", "erection", "boner", "hentai", "onlyfans", "xvideo", "xnxx", "xhamster", "pornhub",
  "brazzers", "chaturbate", "nude", "naked", "boob", "titty", "titties", "penis", "vagina", "clitor", "cumshot",
  "creampie", "gangbang", "threesome", "deepthroat", "sexting", "sexchat", "camgirl", "hooker", "retard",
  "molest", "incest", "bestiality", "wanker", "bollock", "twat", "skank", "milf", "nsfw",
  "killyourself", "pedophile", "paedophile", 
  // Tagalog
  "putangina", "putang", "tangina", "tanginamo", "pakyu", "pakyo", "pakshet", "punyeta", "tarantado",
  "kantot", "kantut", "kinantot", "jakol", "jakul", "nagjajakol", "salsal", "hindot", "hindut", "kupal", "pokpok",
  "chupa", "tsupa", "chupain", "tsupain", "burat", "puday", "pekpek", "kepyas", "iyutan", "libog", "malibog",
  "tamod", "jabol", "kalibugan", "bayag", "etits", "kiffy", "pukingina", "pukinang", "gagong", "ulol",
  "ulul", "letse", "lintik", "bwisit", "bwiset", 
  // Bisaya
  "yawa", "yawaa", "pisti", "piste", "buang", "iyot", "bisong", "atay ka",
  "giatay", 
];

// Matched only as a whole word (these appear inside innocent words: "class", "Sussex", "grape", "analysis").
const EXACT = [
  "ass", "asses", "dick", "dicks", "cock", "cocks", "cum", "cums", "cumming", "fag", "fags", "sex", "sexy", "sexx",
  "rape", "raped", "raping", "anal", "tits", "tit", "hoe", "hoes", "titi", "tite", "otin", "oten", "bogo", "bugo", "bilat", "bilatan", "inamo", "inamu", "rapist", "rapists", "pedo", "pedos", "horny", "hornie", "escort", "escorts", "thot", "puta", "putas", "gago", "gaga", "gaguh",
  "tanga", "bobo", "boba", "bubu", "tae", "pepe", "puke", "puki", "kantotan", "inutil", "ungas",
  "suso", "dede", "utong", "bayot", "bayut", "kys", "stfu", "wtf", "gtfo", "bj", "pm4pm", "dm4dm", "sugar daddy",
];

// Multi-word phrases (checked against the cleaned, space-separated text).
const PHRASES = [
  "tang ina", "puta ng ina", "putang ina", "anak ng puta", "kill yourself", "kill urself", "go die", "hayop ka",
  "send nudes", "send pics", "dm me", "pm me", "add me", "hmu", "sugar daddy", "sugar mommy", "naked pics",
  "atay ka", "boang ka", "buang ka", "bogo ka", "yawa ka", "pisti ka", "ulol ka", "gago ka", "tanga ka", "bobo ka",
  "inutil ka", "pakyu ka", "f u", "f off", "suck my", "suck it", "eat my", "ride me", "wanna fuck", "lets have sex",
  "check my bio", "link in bio", "free money", "earn money", "click here", "crypto giveaway",
];

const LEET = { "0": "o", "1": "i", "!": "i", "|": "i", "3": "e", "4": "a", "@": "a", "5": "s", "$": "s", "7": "t", "+": "t", "8": "b", "9": "g", "2": "z" };
// Look-alike letters from other alphabets (Cyrillic/Greek) and small/full-width forms.
const HOMO = { "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "у": "y", "х": "x", "і": "i", "ј": "j", "к": "k", "м": "m", "т": "t", "н": "h", "в": "b",
  "α": "a", "ε": "e", "ο": "o", "ρ": "p", "τ": "t", "υ": "u", "ν": "v", "κ": "k", "ι": "i" };

const subSet = SUBSTR.filter((w) => !w.includes(" "));
const exactSet = new Set(EXACT.filter((w) => !w.includes(" ")));
const phraseList = [...PHRASES, ...SUBSTR.filter((w) => w.includes(" ")), ...EXACT.filter((w) => w.includes(" "))];
// Long, unmistakable words also checked with every space removed ("f u c k i n g", "p u t a n g i n a").
const NO_SQUASH = new Set(["tangina", "tanginamo", "piste", "pisti", "letse", "lintik", "bwisit", "bwiset", "buang", "naked", "boner", "tamod", "burat",
  "motherf", "etits", "creampie", "threesome", "penis", "chupa", "titty", "skank", "hentai"]);
const SQUASH = subSet.filter((w) => w.length >= 5 && !NO_SQUASH.has(w));

const collapse = (s) => s.replace(/(.)\1+/g, "$1");

export function normalize(raw) {
  let s = raw.normalize("NFKC").toLowerCase();
  s = s.normalize("NFKD").replace(/[̀-ͯ҉]/g, "");          // accents + zalgo marks
  s = s.replace(/[​-‏⁠-⁤﻿]/g, "");               // zero-width chars
  s = [...s].map((c) => HOMO[c] || LEET[c] || c).join("");
  s = s.replace(/([a-z])[*#.\-_'"`~^,]+(?=[a-z])/g, "$1");                // f.u.c.k / f*ck / sh_it
  return s;
}

function tokens(s) {
  const raw = s.split(/[^a-z]+/).filter(Boolean);
  // Join runs of single letters: "f u c k" -> "fuck"
  const out = [];
  let run = "";
  for (const t of raw) {
    if (t.length === 1) { run += t; continue; }
    if (run.length >= 3) out.push(run);
    else if (run) out.push(...run);
    run = "";
    out.push(t);
  }
  if (run.length >= 3) out.push(run); else if (run) out.push(...run);
  return out;
}

/** Returns a reason string if the text breaks the rules, or "" if it's clean. */
export function check(text, extra = []) {
  const raw = String(text);

  // Spam: links, emails, phone numbers, social handles.
  if (/(https?:\/\/|www\.|\b[a-z0-9-]+\s*(\.|dot)\s*(com|net|org|ph|xyz|io|me|co|ly|gg|tv|app|link|site|online|info|biz|cc|ru|top)\b)/i.test(raw)) return "links";
  if (/[a-z0-9._%+-]+\s*@\s*[a-z0-9.-]+\.[a-z]{2,}/i.test(raw)) return "contact";
  if ((raw.replace(/[\s\-().]/g, "").match(/\d{7,}/)) || /(\+?63|0)\s*9\d{2}/.test(raw.replace(/[\s\-().]/g, ""))) return "contact";
  if (/(^|\s)@[a-z0-9_.]{3,}/i.test(raw)) return "contact";

  const s = normalize(raw);
  const toks = tokens(s);
  const extraSub = extra.filter((w) => !w.includes(" "));
  const extraPhr = extra.filter((w) => w.includes(" "));

  for (const t of toks) {
    for (const v of new Set([t, collapse(t)])) {
      if (exactSet.has(v)) return "language";
      for (const w of subSet) if (v.includes(w)) return "language";
      for (const w of extraSub) if (v.includes(w)) return "language";
    }
  }
  const spaced = ` ${toks.join(" ")} `;
  const spacedC = ` ${toks.map(collapse).join(" ")} `;
  for (const p of [...phraseList, ...extraPhr]) {
    if (spaced.includes(` ${p} `) || spacedC.includes(` ${p} `)) return "language";
  }
  const squashed = toks.join("");
  const squashedC = collapse(squashed);
  for (const w of SQUASH) if (squashed.includes(w) || squashedC.includes(w)) return "language";
  return "";
}

/** Tidies a message that passed the filter: trims, limits repeated characters, tames ALL CAPS. */
export function tidy(text) {
  let s = String(text).normalize("NFKC")
    .replace(/[̀-ͯ҉]{2,}/g, "")             // zalgo
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f​-‏⁠-⁤﻿]/g, "")
    .replace(/\s+/g, " ").trim()
    .replace(/(.)\1{4,}/g, "$1$1$1$1");                     // "loooooool" -> "loooool"
  const letters = s.replace(/[^A-Za-z]/g, "");
  if (letters.length > 10 && letters.replace(/[^A-Z]/g, "").length / letters.length > 0.7) {
    s = s.charAt(0) + s.slice(1).toLowerCase();
  }
  return s;
}
