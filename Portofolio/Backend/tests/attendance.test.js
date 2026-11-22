const { dayAttendance, applyCorrections } = require('../src/utils/attendance');

const at = (hhmm) => new Date(`2026-11-01T${hhmm}:00+03:00`);

describe('dayAttendance', () => {
  test('a closed session counts from start to end', () => {
    const day = dayAttendance([{ startedAt: at('07:00'), endedAt: at('15:00') }]);
    expect(day).toEqual({ first_seen: at('07:00'), last_seen: at('15:00'), worked_minutes: 480, open: false });
  });

  test('an open session ends at its last reading, not at the current time', () => {
    const day = dayAttendance([{ startedAt: at('07:00'), endedAt: null, lastReadingAt: at('14:30') }]);
    expect(day.worked_minutes).toBe(450);
    expect(day.last_seen).toEqual(at('14:30'));
    expect(day.open).toBe(true);
  });

  test('an open session with no reading adds no time', () => {
    const day = dayAttendance([{ startedAt: at('07:00'), endedAt: null, lastReadingAt: null }]);
    expect(day.worked_minutes).toBe(0);
  });

  test('time shared by two sessions (a device swap) counts once', () => {
    const day = dayAttendance([
      { startedAt: at('07:00'), endedAt: at('12:00') },
      { startedAt: at('11:00'), endedAt: at('15:00') },
    ]);
    expect(day.worked_minutes).toBe(480);
  });

  test('a break between two sessions is not counted', () => {
    const day = dayAttendance([
      { startedAt: at('07:00'), endedAt: at('12:00') },
      { startedAt: at('13:00'), endedAt: at('16:00') },
    ]);
    expect(day.worked_minutes).toBe(480);
    expect(day.last_seen).toEqual(at('16:00'));
  });

  test('no session means nothing recorded', () => {
    expect(dayAttendance([])).toEqual({ first_seen: null, last_seen: null, worked_minutes: 0, open: false });
  });
});

describe('applyCorrections', () => {
  const original = { first_seen: '07:14', last_seen: '14:55', worked_minutes: 461 };

  test('the latest correction wins and the original stays visible', () => {
    const result = applyCorrections(original, [
      { field: 'worked_minutes', correctedValue: '450' },
      { field: 'worked_minutes', correctedValue: '460' },
    ]);
    expect(result.worked_minutes).toEqual({ original: 461, value: 460, corrected: true });
    expect(result.first_seen).toEqual({ original: '07:14', value: '07:14', corrected: false });
  });

  test('without corrections every value is the recorded one', () => {
    const result = applyCorrections(original, []);
    expect(result.last_seen).toEqual({ original: '14:55', value: '14:55', corrected: false });
  });
});
