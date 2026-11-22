jest.mock('../src/utils/chrome', () => ({ findChrome: () => '/fake/chrome' }));

jest.mock('puppeteer-core', () => ({
  launch: jest.fn(async () => {
    const { EventEmitter } = require('node:events');
    const b = new EventEmitter();
    b.connected = true;
    b.close = async () => {};
    b.newPage = async () => {
      if (b.broken) throw new Error('Connection closed.');
      return { browser: b };
    };
    return b;
  }),
}));

const { getBrowser, openPage } = require('../src/services/report.service');

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

  test('a browser that still says connected but has lost its connection is replaced, and the page opens', async () => {
    const first = await getBrowser();
    first.broken = true;
    const page = await openPage();
    expect(page.browser).not.toBe(first);
    expect(await getBrowser()).toBe(page.browser);
  });
});
