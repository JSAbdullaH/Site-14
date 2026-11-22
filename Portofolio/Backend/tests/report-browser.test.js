jest.mock('../src/utils/chrome', () => ({ findChrome: () => '/fake/chrome' }));

jest.mock('puppeteer-core', () => ({
  launch: jest.fn(async () => {
    const { EventEmitter } = require('node:events');
    const b = new EventEmitter();
    b.connected = true;
    b.close = async () => {};
    return b;
  }),
}));

const { getBrowser } = require('../src/services/report.service');

describe('PDF browser (SITE-195)', () => {
  test('a connected browser is reused', async () => {
    const first = await getBrowser();
    const second = await getBrowser();
    expect(second).toBe(first);
  });

  test('a browser that lost its connection is replaced on the next report', async () => {
    const first = await getBrowser();
    first.connected = false;
    const second = await getBrowser();
    expect(second).not.toBe(first);
    expect(second.connected).toBe(true);
  });

  test('a browser that disconnects is forgotten at once', async () => {
    const first = await getBrowser();
    first.connected = false;
    first.emit('disconnected');
    const second = await getBrowser();
    expect(second).not.toBe(first);
  });
});
