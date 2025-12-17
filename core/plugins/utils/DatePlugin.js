// core/plugins/DatePlugin.js
// Plugin utilitário de datas — leve, seguro e sem dependências.
// Suporte a operações comuns: criação, formatação, cálculo, comparação e humanização.

/**
 * @typedef {Object} AddFields
 * @property {number} [years]
 * @property {number} [months]
 * @property {number} [days]
 * @property {number} [hours]
 * @property {number} [minutes]
 * @property {number} [seconds]
 * @property {number} [ms]
 */

/**
 * Normaliza entrada para Date válida. Retorna null se inválido.
 * Aceita: Date, number (timestamp), string ISO, string numérica.
 * @param {any} input
 * @returns {Date | null}
 */
function parseDate(input) {
  if (input instanceof Date) return new Date(input.getTime());
  if (typeof input === "number") return new Date(input);
  if (typeof input === "string") {
    // Aceita string numérica (ex: "1712345678901")
    if (/^\d+$/.test(input)) {
      const num = Number(input);
      return Number.isNaN(num) ? null : new Date(num);
    }
    const d = new Date(input);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

module.exports = ({ app, options = {} } = {}) => {
  // Registro do plugin
  if (typeof app?.pluginsNames === "object") {
    app.pluginsNames.DatePlugin = true;
  }

  // Constantes de tempo em milissegundos
  const Tempo = {
    MS: 1,
    SECOND: 1_000,
    MINUTE: 60 * 1_000,
    HOUR: 60 * 60 * 1_000,
    DAY: 24 * 60 * 60 * 1_000,
    WEEK: 7 * 24 * 60 * 60 * 1_000,
  };

  // Funções principais
  const now = () => new Date();
  const nowISO = () => new Date().toISOString();
  const ts = () => Date.now();

  /**
   * @param {*} input
   * @returns {Date | null}
   */
  const toDate = parseDate;

  /**
   * @param {*} date
   * @returns {string}
   */
  const toISO = (date) => {
    const d = toDate(date ?? now());
    if (!d) throw new Error("toISO: data inválida");
    return d.toISOString();
  };

  /**
   * @param {string} isoString
   * @returns {Date | null}
   */
  const fromISO = (iso = "") => {
    if (!iso) return null;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  /**
   * @param {*} input
   * @returns {number}
   */
  const toTimestamp = (input) => {
    const d = toDate(input);
    if (!d) throw new Error("toTimestamp: data inválida");
    return d.getTime();
  };

  /**
   * Formata data usando Intl.DateTimeFormat
   * @param {*} date
   * @param {{ locale?: string, options?: Intl.DateTimeFormatOptions }} opts
   * @returns {string}
   */
  const format = (date, opts = {}) => {
    const d = toDate(date);
    if (!d) throw new Error("format: data inválida");
    const locale =
      opts.locale || options.locale || app?.options?.locale || "en-US";
    const fmtOpts = opts.options || {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    };
    return new Intl.DateTimeFormat(locale, fmtOpts).format(d);
  };

  /**
   * Adiciona valores a uma data (anos, meses, dias, etc.)
   * @param {*} inputDate
   * @param {AddFields} fields
   * @returns {Date}
   */
  const add = (inputDate, fields = {}) => {
    const d = toDate(inputDate ?? now());
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

    // Anos e meses primeiro (afetam o calendário)
    if (years !== 0 || months !== 0) {
      const y = d.getFullYear() + Number(years);
      const m = d.getMonth() + Number(months);
      d.setFullYear(y, m, d.getDate()); // setFullYear ajusta automaticamente dias inválidos
    }

    // Unidades fixas (não dependem do calendário)
    if (days) d.setDate(d.getDate() + Number(days));
    if (hours) d.setHours(d.getHours() + Number(hours));
    if (minutes) d.setMinutes(d.getMinutes() + Number(minutes));
    if (seconds) d.setSeconds(d.getSeconds() + Number(seconds));
    if (ms) d.setMilliseconds(d.getMilliseconds() + Number(ms));

    return d;
  };

  /**
   * Calcula diferença entre duas datas
   * @param {*} a
   * @param {*} [b]
   * @param {'ms'|'s'|'m'|'h'|'d'} [unit='ms']
   * @returns {number}
   */
  const diff = (a, b = undefined, unit = "ms") => {
    const da = toDate(a);
    const db = b === undefined ? now() : toDate(b);
    if (!da || !db) throw new Error("diff: data inválida");
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
      default:
        return delta; // 'ms'
    }
  };

  /**
   * Retorna início da unidade (ano, mês, dia, etc.)
   * @param {*} input
   * @param {'year'|'month'|'day'|'hour'|'minute'|'second'} [unit='day']
   * @returns {Date}
   */
  const startOf = (input, unit = "day") => {
    const d = toDate(input ?? now());
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
        throw new Error(`startOf: unidade inválida '${unit}'`);
    }
    return d;
  };

  /**
   * Retorna fim da unidade
   * @param {*} input
   * @param {'year'|'month'|'day'|'hour'|'minute'|'second'} [unit='day']
   * @returns {Date}
   */
  const endOf = (input, unit = "day") => {
    const d = toDate(input ?? now());
    if (!d) throw new Error("endOf: data inválida");

    switch (unit) {
      case "year":
        d.setMonth(11, 31);
        d.setHours(23, 59, 59, 999);
        break;
      case "month":
        d.setMonth(d.getMonth() + 1, 0); // último dia do mês atual
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
        throw new Error(`endOf: unidade inválida '${unit}'`);
    }
    return d;
  };

  /**
   * Verifica se a data A é anterior a B
   * @param {*} a
   * @param {*} [b]
   * @returns {boolean}
   */
  const isBefore = (a, b = now()) => {
    const da = toDate(a),
      db = toDate(b);
    if (!da || !db) throw new Error("isBefore: data inválida");
    return da.getTime() < db.getTime();
  };

  /**
   * Verifica se a data A é posterior a B
   * @param {*} a
   * @param {*} [b]
   * @returns {boolean}
   */
  const isAfter = (a, b = now()) => {
    const da = toDate(a),
      db = toDate(b);
    if (!da || !db) throw new Error("isAfter: data inválida");
    return da.getTime() > db.getTime();
  };

  /**
   * Verifica se duas datas são "iguais" na unidade especificada
   * @param {*} a
   * @param {*} b
   * @param {'ms'|'s'|'m'|'h'|'d'|'month'|'year'} [unit='ms']
   * @returns {boolean}
   */
  const isSame = (a, b, unit = "ms") => {
    const da = toDate(a),
      db = toDate(b);
    if (!da || !db) throw new Error("isSame: data inválida");

    switch (unit) {
      case "ms":
        return da.getTime() === db.getTime();
      case "s":
        return (
          Math.floor(da.getTime() / 1000) === Math.floor(db.getTime() / 1000)
        );
      case "m":
        return (
          Math.floor(da.getTime() / Tempo.MINUTE) ===
          Math.floor(db.getTime() / Tempo.MINUTE)
        );
      case "h":
        return (
          Math.floor(da.getTime() / Tempo.HOUR) ===
          Math.floor(db.getTime() / Tempo.HOUR)
        );
      case "d":
        return (
          da.getFullYear() === db.getFullYear() &&
          da.getMonth() === db.getMonth() &&
          da.getDate() === db.getDate()
        );
      case "month":
        return (
          da.getFullYear() === db.getFullYear() &&
          da.getMonth() === db.getMonth()
        );
      case "year":
        return da.getFullYear() === db.getFullYear();
      default:
        return da.getTime() === db.getTime();
    }
  };

  /**
   * Retorna diferença legível entre duas datas
   * @param {*} a
   * @param {*} [b]
   * @returns {string}
   */
  const humanizeDiff = (a, b = now()) => {
    const deltaMs = Math.abs(diff(a, b, "ms"));
    if (deltaMs < Tempo.SECOND) return `${Math.round(deltaMs)} ms`;
    if (deltaMs < Tempo.MINUTE)
      return `${Math.round(deltaMs / Tempo.SECOND)} s`;
    if (deltaMs < Tempo.HOUR) return `${Math.round(deltaMs / Tempo.MINUTE)} m`;
    if (deltaMs < Tempo.DAY) return `${Math.round(deltaMs / Tempo.HOUR)} h`;
    return `${Math.round(deltaMs / Tempo.DAY)} d`;
  };

  // API pública
  return {
    // Tempo,
    toDate,
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
};
