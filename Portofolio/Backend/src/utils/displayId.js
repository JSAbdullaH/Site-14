// Readable IDs: company key, type letter, number. AI-E-100012 is employee 100012 of
// the company whose key is AI. The database hands out the numbers (migration
// 20261124000000_display_ids); this file only formats and reads them.
const TYPE = { employee: 'E', task: 'T', site: 'S' };

const KEY = /^[A-Z]{2,5}$/;

function format(companyKey, type, number) {
  return `${companyKey}-${TYPE[type]}-${number}`;
}

// The number in a search, if the search is one of this type's IDs or just its six
// digits: "AI-E-100012", "ai-e-100012" and "100012" all give 100012. The key is not
// checked, because a company only ever searches its own rows.
function numberIn(search, type) {
  if (!search) return null;
  const text = search.trim().toUpperCase();
  const match = text.match(/^(?:[A-Z]{2,5}-([ETS])-)?(\d{6})$/);
  if (!match || (match[1] && match[1] !== TYPE[type])) return null;
  return Number(match[2]);
}

module.exports = { TYPE, KEY, format, numberIn };
