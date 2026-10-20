const { prisma } = require('../config/db');
const { MIDDAY_BAN } = require('../config/rules');

// `tx` is the transaction client from prisma.$transaction, so the company and
// its first user are created together.
async function create(tx, { name, commercialRegistration }) {
  return tx.company.create({
    data: { name, commercialRegistration: commercialRegistration || null },
    select: { id: true },
  });
}

// Keeps the snake_case JSON shape the API returned before Prisma.
// The midday ban is the same for every company (config/rules.js).
async function findById(id) {
  const company = await prisma.company.findUnique({
    where: { id },
    select: { id: true, name: true },
  });
  if (!company) return null;
  const year = new Date().getFullYear();
  return {
    id: company.id,
    name: company.name,
    midday_ban_from_date: `${year}-${MIDDAY_BAN.fromMonthDay}`,
    midday_ban_to_date: `${year}-${MIDDAY_BAN.toMonthDay}`,
    midday_ban_start_time: MIDDAY_BAN.startTime,
    midday_ban_end_time: MIDDAY_BAN.endTime,
  };
}

module.exports = { create, findById };
