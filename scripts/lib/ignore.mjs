// @ts-check
/**
 * Gitignore-style matcher with the exact semantics `liara deploy` uses to pick the files it uploads.
 *
 * Liara CLI 9.x filters the upload with node-ignore 5.3.1. This module is a faithful, dependency-free
 * port of that library's rule compiler and matching algorithm, so `scripts/check-size.sh` can reproduce
 * the upload even on machines/CI runners without the Liara CLI installed.
 *
 * Port of node-ignore 5.3.1 — MIT License, Copyright (c) 2013 Kael Zhang <i@kael.me>
 * https://github.com/kaelzhang/node-ignore
 */

const EMPTY = '';
const SPACE = ' ';
const ESCAPE = '\\';
const SLASH = '/';
const REGEX_TEST_BLANK_LINE = /^\s+$/;
const REGEX_INVALID_TRAILING_BACKSLASH = /(?:[^\\]|^)\\$/;
const REGEX_REPLACE_LEADING_ESCAPED_EXCLAMATION = /^\\!/;
const REGEX_REPLACE_LEADING_ESCAPED_HASH = /^\\#/;
const REGEX_SPLITALL_CRLF = /\r?\n/g;
const REGEX_TEST_INVALID_PATH = /^\.*\/|^\.+$/;
const REGEX_REGEXP_RANGE = /([0-z])-([0-z])/g;

/** @param {string} range */
const sanitizeRange = (range) =>
  range.replace(REGEX_REGEXP_RANGE, (match, from, to) => (from.charCodeAt(0) <= to.charCodeAt(0) ? match : EMPTY));

/** @param {string} slashes */
const cleanRangeBackSlash = (slashes) => slashes.slice(0, slashes.length - (slashes.length % 2));

/**
 * Ordered regex rewrites that turn one gitignore pattern into a JS regular expression source.
 * `this` is bound to the original pattern (used by the "starting" replacer).
 * @type {Array<[RegExp, (this: string, ...args: any[]) => string]>}
 */
const REPLACERS = [
  // remove BOM
  [/^﻿/, () => EMPTY],
  // trailing spaces are ignored unless escaped
  [/\\?\s+$/, (match) => (match.indexOf('\\') === 0 ? SPACE : EMPTY)],
  // "\ " -> " "
  [/\\\s/g, () => SPACE],
  // escape regex metacharacters
  [/[\\$.|*+(){^]/g, (match) => `\\${match}`],
  // "?" matches one non-slash char
  [/(?!\\)\?/g, () => '[^/]'],
  // leading slash anchors to the root
  [/^\//, () => '^'],
  // escape remaining slashes
  [/\//g, () => '\\/'],
  // leading "**/" matches in all directories
  [/^\^*\\\*\\\*\\\//, () => '^(?:.*\\/)?'],
  // starting: a pattern with a slash at the beginning/middle is anchored, otherwise it matches at any level
  [
    /^(?=[^^])/,
    function startingReplacer() {
      return !/\/(?!$)/.test(this) ? '(?:^|\\/)' : '^';
    },
  ],
  // "/**/" (zero or more dirs) and trailing "/**" (everything inside)
  [
    /\\\/\\\*\\\*(?=\\\/|$)/g,
    (_, index, str) => (index + 6 < str.length ? '(?:\\/[^\\/]+)*' : '\\/.+'),
  ],
  // intermediate "*" never crosses a slash
  [
    /(^|[^\\]+)(\\\*)+(?=.+)/g,
    (_, p1, p2) => {
      const unescaped = p2.replace(/\\\*/g, '[^\\/]*');
      return p1 + unescaped;
    },
  ],
  // unescape escaped metacharacters (except backslash)
  [/\\\\\\(?=[$.|*+(){^])/g, () => ESCAPE],
  [/\\\\/g, () => ESCAPE],
  // [a-z] ranges
  [
    /(\\)?\[([^\]/]*?)(\\*)($|\])/g,
    (match, leadEscape, range, endEscape, close) =>
      leadEscape === ESCAPE
        ? `\\[${range}${cleanRangeBackSlash(endEscape)}${close}`
        : close === ']'
          ? endEscape.length % 2 === 0
            ? `[${sanitizeRange(range)}${endEscape}]`
            : '[]'
          : '[]',
  ],
  // ending: "foo" matches "foo" and "foo/", "foo/" matches only "foo/"
  [/(?:[^*])$/, (match) => (/\/$/.test(match) ? `${match}$` : `${match}(?=$|\\/$)`)],
  // trailing wildcard
  [
    /(\^|\\\/)?\\\*$/,
    (_, p1) => {
      const prefix = p1 ? `${p1}[^/]+` : '[^/]*';
      return `${prefix}(?=$|\\/$)`;
    },
  ],
];

/** @type {Map<string, string>} */
const regexSourceCache = new Map();

/**
 * Compile one (non-negated, unescaped) gitignore pattern into a RegExp, exactly like node-ignore.
 * @param {string} pattern
 * @param {boolean} ignoreCase
 */
export function makeRegex(pattern, ignoreCase) {
  let source = regexSourceCache.get(pattern);
  if (source === undefined) {
    source = REPLACERS.reduce((prev, [re, fn]) => prev.replace(re, /** @type {any} */ (fn).bind(pattern)), pattern);
    regexSourceCache.set(pattern, source);
  }
  return ignoreCase ? new RegExp(source, 'i') : new RegExp(source);
}

/** @param {unknown} pattern */
const checkPattern = (pattern) =>
  typeof pattern === 'string' &&
  pattern !== '' &&
  !REGEX_TEST_BLANK_LINE.test(pattern) &&
  !REGEX_INVALID_TRAILING_BACKSLASH.test(pattern) &&
  pattern.indexOf('#') !== 0;

/**
 * @typedef {{ origin: string, pattern: string, negative: boolean, regex: RegExp }} IgnoreRule
 * @typedef {{ ignored: boolean, unignored: boolean }} TestResult
 */

/**
 * @param {string} origin
 * @param {boolean} ignoreCase
 * @returns {IgnoreRule}
 */
function createRule(origin, ignoreCase) {
  let pattern = origin;
  let negative = false;
  if (pattern.indexOf('!') === 0) {
    negative = true;
    pattern = pattern.slice(1);
  }
  pattern = pattern.replace(REGEX_REPLACE_LEADING_ESCAPED_EXCLAMATION, '!').replace(REGEX_REPLACE_LEADING_ESCAPED_HASH, '#');
  return { origin, pattern, negative, regex: makeRegex(pattern, ignoreCase) };
}

/** A set of gitignore rules; later rules win, and a path inside an ignored directory can't be re-included. */
export class Ignore {
  /** @param {{ ignoreCase?: boolean }} [opts] */
  constructor(opts = {}) {
    this.ignoreCase = opts.ignoreCase ?? true;
    /** @type {IgnoreRule[]} */
    this.rules = [];
    /** @type {Record<string, TestResult>} */
    this.cache = Object.create(null);
  }

  /**
   * Add patterns (a .gitignore body or an array of lines). Comments/blank lines are skipped.
   * @param {string | readonly string[]} patterns
   */
  add(patterns) {
    const list = typeof patterns === 'string' ? patterns.split(REGEX_SPLITALL_CRLF) : patterns;
    let added = false;
    for (const p of list) {
      if (checkPattern(p)) {
        this.rules.push(createRule(p, this.ignoreCase));
        added = true;
      }
    }
    if (added) this.cache = Object.create(null);
    return this;
  }

  /**
   * @param {string} path
   * @returns {TestResult}
   */
  testOne(path) {
    let ignored = false;
    let unignored = false;
    for (const rule of this.rules) {
      const { negative } = rule;
      // Same short-circuit table as node-ignore (checkUnignored = false).
      if ((unignored === negative && ignored !== unignored) || (negative && !ignored && !unignored)) continue;
      if (rule.regex.test(path)) {
        ignored = !negative;
        unignored = negative;
      }
    }
    return { ignored, unignored };
  }

  /**
   * @param {string} path
   * @param {string[]} [slices]
   * @returns {TestResult}
   */
  t(path, slices) {
    const cached = this.cache[path];
    if (cached) return cached;
    const parts = slices ?? path.split(SLASH);
    parts.pop();
    if (!parts.length) return (this.cache[path] = this.testOne(path));
    const parent = this.t(parts.join(SLASH) + SLASH, parts);
    return (this.cache[path] = parent.ignored ? parent : this.testOne(path));
  }

  /**
   * True when `path` (POSIX, relative to the root, no leading "./") is ignored.
   * @param {string} path
   */
  ignores(path) {
    if (typeof path !== 'string' || path === '') throw new TypeError('path must be a non-empty string');
    if (REGEX_TEST_INVALID_PATH.test(path)) throw new RangeError(`path should be a relative path, got "${path}"`);
    return this.t(path).ignored;
  }
}
