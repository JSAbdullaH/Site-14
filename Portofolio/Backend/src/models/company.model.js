const { prisma } = require('../config/db');

// "12:00:00" from a Prisma TIME value (returned as a Date on 1970-01-01, UTC).
const toTime = (d) => (d ? d.toISOString().slice(11, 19) : null);
// "2026-06-15" from a Prisma DATE value.
const toDate = (d) => (d ? d.toISOString().slice(0, 10) : null);

// `tx` is the transaction client from prisma.$transaction, so the company and
// its first user are created together.
async function create(tx, { name, commercialRegistration }) {
  return tx.company.create({
    data: { name, commercialRegistration: commercialRegistration || null },
    select: { id: true },
  });
}

// Keeps the snake_case JSON shape the API returned before Prisma.
async function findById(id) {
  const company = await prisma.company.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      middayBanFromDate: true,
      middayBanToDate: true,
      middayBanStartTime: true,
      middayBanEndTime: true,
    },
  });
  if (!company) return null;
  return {
    id: company.id,
    name: company.name,
    midday_ban_from_date: toDate(company.middayBanFromDate),
    midday_ban_to_date: toDate(company.middayBanToDate),
    midday_ban_start_time: toTime(company.middayBanStartTime),
    midday_ban_end_time: toTime(company.middayBanEndTime),
  };
}

module.exports = { create, findById };
