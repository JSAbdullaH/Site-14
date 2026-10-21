const { prisma } = require('../config/db');

// Midday ban on work under direct sun (Saudi labour rules): 12:00 to 15:00,
// from 15 June to 15 September. The same for every company, so it is a
// constant here, not a column. The rule engine will import it from this file.
const MIDDAY_BAN = { fromMonthDay: '06-15', toMonthDay: '09-15', startTime: '12:00:00', endTime: '15:00:00' };

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

module.exports = { create, findById, MIDDAY_BAN };
