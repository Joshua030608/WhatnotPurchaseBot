(function (root, factory) {
  const api = factory();
  root.WhatnotBotMoney = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis, function () {
  function parseCents(value) {
    if (Number.isInteger(value)) return value;
    if (typeof value === "number") return Number.isFinite(value) ? Math.round(value * 100) : null;
    if (typeof value !== "string") return null;
    let source = value.trim().replace(/\u00a0/g, " ");
    if (!source || /^[-+]?\s*$/.test(source)) return null;
    const negative = /^\s*-/.test(source);
    source = source.replace(/[^\d.,]/g, "");
    if (!source) return null;
    const dot = source.lastIndexOf(".");
    const comma = source.lastIndexOf(",");
    const separator = Math.max(dot, comma);
    let normalized;
    if (separator >= 0 && source.length - separator - 1 > 0 && source.length - separator - 1 <= 2) {
      normalized = source.slice(0, separator).replace(/[.,]/g, "") + "." + source.slice(separator + 1);
    } else {
      normalized = source.replace(/[.,]/g, "");
    }
    const amount = Number(normalized);
    if (!Number.isFinite(amount)) return null;
    return Math.round(amount * 100) * (negative ? -1 : 1);
  }

  function parsePriceText(value) {
    if (typeof value !== "string") return null;
    const matches = value.match(/(?:US\$|CA\$|AU\$|NZ\$|[\$£€])\s*\d[\d.,]*/gi);
    if (!matches || !matches.length) return null;
    return parseCents(matches[matches.length - 1]);
  }

  function currencySymbol(value) {
    if (typeof value !== "string") return "$";
    const match = value.match(/US\$|CA\$|AU\$|NZ\$|[\$£€]/i);
    return match ? match[0] : "$";
  }

  function formatCents(cents, symbol) {
    if (!Number.isInteger(cents)) return "—";
    const amount = (cents / 100).toLocaleString(undefined, {
      minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
      maximumFractionDigits: 2
    });
    return `${symbol || "$"}${amount}`;
  }

  return { parseCents, parsePriceText, currencySymbol, formatCents };
});
