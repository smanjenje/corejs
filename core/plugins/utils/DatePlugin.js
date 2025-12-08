// core/plugins/DatePlugin.js
// Plugin utilitário de datas — pequenas helpers sem dependências externas.
// Uso: app.addPlugin(require('./core/plugins/DatePlugin'))
// Expondo funções: now, nowISO, ts, toISO, fromISO, toDate, format, add, diff, startOf, endOf, isBefore, isAfter, isSame, humanizeDiff, Tempo

module.exports = ({ app, options = {} } = {}) => {
  app.pluginsNames.DatePlugin = true;
  // Tempo em ms (útil para TTLs)
  const Tempo = {
    MS: 1,
    SECOND: 1000,
    MINUTE: 60 * 1000,
    HOUR: 60 * 60 * 1000,
    DAY: 24 * 60 * 60 * 1000,
    WEEK: 7 * 24 * 60 * 60 * 1000,
  };

  // Normaliza entrada para Date (não muta original)
  function toDate(input) {
    if (input instanceof Date) return new Date(input.getTime());
    if (typeof input === "number") return new Date(input);
    if (typeof input === "string") {
      const d = new Date(input);
      if (Number.isNaN(d.getTime())) return null;
      return d;
    }
    return null;
  }

  function now() {
    return new Date();
  }

  function nowISO() {
    return new Date().toISOString();
  }

  function ts() {
    return Date.now();
  }

  function toISO(date) {
    const d = toDate(date || now());
    if (!d) throw new Error("toISO: data inválida");
    return d.toISOString();
  }

  function fromISO(isoString) {
    if (!isoString) return null;
    const d = new Date(isoString);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function toTimestamp(input) {
    const d = toDate(input);
    if (!d) throw new Error("toTimestamp: data inválida");
    return d.getTime();
  }

  // format usando Intl.DateTimeFormat
  // opts: { locale, options } where options são as opções do Intl.DateTimeFormat
  function format(date, opts = {}) {
    const d = toDate(date);
    if (!d) throw new Error("format: data inválida");
    const locale = opts.locale || options.locale || "en-US";
    const fmtOpts = opts.options || {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    };
    return new Intl.DateTimeFormat(locale, fmtOpts).format(d);
  }

  // add: adiciona valores (pode receber números negativos)
  // fields: { years, months, days, hours, minutes, seconds, ms }
  function add(inputDate, fields = {}) {
    const d = toDate(inputDate || now());
    if (!d) throw new Error("add: data inválida");
    const {
      years = 0,
      months = 0,
      days = 0,
      hours = 0,
      minutes = 0,
      seconds = 0,
      ms = 0,
    } = fields;

    if (years || months) {
      const y = d.getFullYear() + Number(years || 0);
      const m = d.getMonth() + Number(months || 0);
      // Ajusta ano/mês automaticamente usando Date constructor
      d.setFullYear(y);
      d.setMonth(m);
    }
    if (days) d.setDate(d.getDate() + Number(days));
    if (hours) d.setHours(d.getHours() + Number(hours));
    if (minutes) d.setMinutes(d.getMinutes() + Number(minutes));
    if (seconds) d.setSeconds(d.getSeconds() + Number(seconds));
    if (ms) d.setMilliseconds(d.getMilliseconds() + Number(ms));

    return d;
  }

  // diff entre duas datas: unit -> ms|s|m|h|d
  function diff(a, b = undefined, unit = "ms") {
    const da = toDate(a);
    if (!da) throw new Error("diff: data A inválida");
    const db = b === undefined ? now() : toDate(b);
    if (!db) throw new Error("diff: data B inválida");
    const delta = da.getTime() - db.getTime();
    switch (unit) {
      case "s":
      case "sec":
      case "seconds":
        return delta / Tempo.SECOND;
      case "m":
      case "min":
      case "minutes":
        return delta / Tempo.MINUTE;
      case "h":
      case "hour":
        return delta / Tempo.HOUR;
      case "d":
      case "day":
        return delta / Tempo.DAY;
      case "ms":
      default:
        return delta;
    }
  }

  // startOf / endOf support basic units: year, month, day, hour, minute, second
  function startOf(input, unit = "day") {
    const d = toDate(input || now());
    if (!d) throw new Error("startOf: data inválida");
    switch (unit) {
      case "year":
        d.setMonth(0, 1);
        d.setHours(0, 0, 0, 0);
        break;
      case "month":
        d.setDate(1);
        d.setHours(0, 0, 0, 0);
        break;
      case "day":
        d.setHours(0, 0, 0, 0);
        break;
      case "hour":
        d.setMinutes(0, 0, 0);
        break;
      case "minute":
        d.setSeconds(0, 0);
        break;
      case "second":
        d.setMilliseconds(0);
        break;
      default:
        throw new Error("startOf: unit inválido");
    }
    return d;
  }

  function endOf(input, unit = "day") {
    const d = toDate(input || now());
    if (!d) throw new Error("endOf: data inválida");
    switch (unit) {
      case "year":
        d.setMonth(11, 31);
        d.setHours(23, 59, 59, 999);
        break;
      case "month":
        d.setMonth(d.getMonth() + 1, 0); // último dia do mês
        d.setHours(23, 59, 59, 999);
        break;
      case "day":
        d.setHours(23, 59, 59, 999);
        break;
      case "hour":
        d.setMinutes(59, 59, 999);
        break;
      case "minute":
        d.setSeconds(59, 999);
        break;
      case "second":
        d.setMilliseconds(999);
        break;
      default:
        throw new Error("endOf: unit inválido");
    }
    return d;
  }

  // Comparadores
  function isBefore(a, b = now()) {
    const da = toDate(a);
    const db = toDate(b);
    if (!da || !db) throw new Error("isBefore: data inválida");
    return da.getTime() < db.getTime();
  }

  function isAfter(a, b = now()) {
    const da = toDate(a);
    const db = toDate(b);
    if (!da || !db) throw new Error("isAfter: data inválida");
    return da.getTime() > db.getTime();
  }

  function isSame(a, b, unit = "ms") {
    const delta = Math.abs(diff(a, b, "ms"));
    if (unit === "ms") return delta === 0;
    if (unit === "s") return delta < Tempo.SECOND;
    if (unit === "m") return delta < Tempo.MINUTE;
    if (unit === "h") return delta < Tempo.HOUR;
    if (unit === "d") return delta < Tempo.DAY;
    return delta === 0;
  }

  // humanizeDiff: retorna string amigável entre duas datas (a - b)
  function humanizeDiff(a, b = now()) {
    const deltaMs = Math.abs(diff(a, b, "ms"));
    if (deltaMs < Tempo.SECOND) return `${Math.round(deltaMs)} ms`;
    if (deltaMs < Tempo.MINUTE)
      return `${Math.round(deltaMs / Tempo.SECOND)} s`;
    if (deltaMs < Tempo.HOUR) return `${Math.round(deltaMs / Tempo.MINUTE)} m`;
    if (deltaMs < Tempo.DAY) return `${Math.round(deltaMs / Tempo.HOUR)} h`;
    if (deltaMs < Tempo.WEEK) return `${Math.round(deltaMs / Tempo.DAY)} d`;
    return `${Math.round(deltaMs / Tempo.DAY)} d`;
  }

  // pequena utilidade para parse flexível (fallbacks): tries Date parsing, then numeric
  function parse(input) {
    if (input instanceof Date) return input;
    if (typeof input === "number") return new Date(input);
    if (typeof input === "string") {
      // aceita timestamps numéricos em string também
      if (/^\d+$/.test(input)) return new Date(Number(input));
      const d = new Date(input);
      if (!Number.isNaN(d.getTime())) return d;
    }
    return null;
  }

  // Integração com app
  const api = {
    Tempo,
    toDate: parse, // fornece parse flexível
    now,
    nowISO,
    ts,
    toISO,
    fromISO,
    toTimestamp,
    format,
    add,
    diff,
    startOf,
    endOf,
    isBefore,
    isAfter,
    isSame,
    humanizeDiff,
  };

  return api;
};
