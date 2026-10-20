// Fixed working rules from the Saudi labour regulations (business study).
// They are the same for every company, so they live in code, not in the database.

// Midday ban on work under direct sun: 12:00 to 15:00 Saudi time,
// from 15 June to 15 September.
const MIDDAY_BAN = {
  fromMonthDay: '06-15',
  toMonthDay: '09-15',
  startTime: '12:00:00',
  endTime: '15:00:00',
};

module.exports = { MIDDAY_BAN };
