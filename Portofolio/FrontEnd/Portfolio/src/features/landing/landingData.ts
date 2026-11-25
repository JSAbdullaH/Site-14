export const accent = '#FF6A2B';
const toCells = (rows: string[], pal: Record<string, string>, cols: number) => {
  const out: { bg: string }[] = [];
  rows.forEach((r) => {
    const line = r.padEnd(cols, '.');
    for (let i = 0; i < cols; i++) out.push({ bg: pal[line[i]] || 'transparent' });
  });
  return out;
};
const live = [
  '..######################..',
  '.#......................#.',
  '#...rr..................#.',
  '#..rrrr........######...#.',
  '#...rr........#......#..#.',
  '#....r........#..rr..#..#.',
  '#.............#..rr..#..#.',
  '#.....#######..######...#.',
  '#.....#.....#...........#.',
  '#.....#..rr.#.......rr..#.',
  '#.....#..rr.#......rrrr.#.',
  '#.....#######.......rr..#.',
  '#....................r..#.',
  '.#......................#.',
  '..######################..'
];
const watch = [
  '....######....',
  '....######....',
  '....######....',
  '...########...',
  '..##########..',
  '.############.',
  '.##oooooooo##.',
  '.##ooorrooo##.',
  '.##oorrrroo###',
  '.##oorrrroo###',
  '.##ooorrooo##.',
  '.##ooooroooo#.',
  '.##oooooooo##.',
  '.##oooooooo##.',
  '.############.',
  '..##########..',
  '...########...',
  '....######....',
  '....######....',
  '....######....'
];
const report = [
  '############....',
  '#pppppppppp##...',
  '#pppppppppp#p#..',
  '#pppppppppp####.',
  '#ppppppppppppp#.',
  '#pp########ppp#.',
  '#ppppppppppppp#.',
  '#pp##########p#.',
  '#ppppppppppppp#.',
  '#pp#########pp#.',
  '#ppppppppppppp#.',
  '#pp#######pppp#.',
  '#pppppppppgggg#.',
  '#ppppppppgggggg.',
  '#pppppppgggggwgg',
  '#pppppppggwgwggg',
  '#pppppppgggwgggg',
  '#ppppppppgggggg.',
  '##########gggg..'
];
const pal: Record<string, string> = { '#': '#252525', 'o': '#D4D2CF', 'r': '#DB4406', 'w': '#FFFFFF', 'p': '#F7F7F4', 'g': '#2F7D4F' };
export const stamps = [
  { title: 'EVERY 5 SEC', sub: 'Location on the map', label: 'LIVE', note: 'Zones and alerts in real time', color: '#B93A07', alt: 'Pixel site map with zones and workers', cols: 26, size: 7, cells: toCells(live, pal, 26) },
  { title: '1 SCAN', sub: 'To connect a device', label: 'DEVICES', note: 'Phones, watches and trackers', color: '#15607A', alt: 'Pixel smartwatch showing a location pin', cols: 14, size: 9, cells: toCells(watch, pal, 14) },
  { title: 'SHA-256', sub: 'On every report', label: 'REPORTS', note: 'Check any PDF in seconds', color: '#2F7D4F', alt: 'Pixel report with a verified seal', cols: 16, size: 9, cells: toCells(report, pal, 16) }
];

export const steps = [
  { n: '01', title: 'Draw your site', body: 'Outline the site on the map, then add zones and mark each one outdoor or indoor.' },
  { n: '02', title: 'Add your crew', body: 'Import workers from a CSV and give each one a site.' },
  { n: '03', title: 'Connect devices', body: 'Show a QR code, register trackers by serial, or order devices from SITE14.' },
  { n: '04', title: 'Watch it run', body: 'The live map, alerts and tasks fill in on their own from there.' },
  { n: '05', title: 'Generate reports', body: 'Issue daily, weekly or monthly PDF reports that anyone can verify.' }
];

export const tasks = [
  { title: 'Fix rebar, level 6 slab', who: 'Faisal Al-Harbi', status: 'Done', bg: '#E8F3EC', fg: '#2F7D4F' },
  { title: 'Lift formwork panels', who: 'Yousef Kamal', status: 'In progress', bg: '#E3EEF3', fg: '#15607A' },
  { title: 'Shutter stair core', who: 'Omar Khalid', status: 'In progress', bg: '#E3EEF3', fg: '#15607A' },
  { title: 'Clear laydown yard', who: 'Majed Saleh', status: 'To do', bg: '#EFEEEC', fg: '#4A4843' }
];

const N = 21;
const finder = (r: number, c: number) => {
  const inBox = (r0: number, c0: number) => r >= r0 && r < r0 + 7 && c >= c0 && c < c0 + 7;
  const boxes: [number, number][] = [[0, 0], [0, 14], [14, 0]];
  for (const [r0, c0] of boxes) {
    if (inBox(r0, c0)) {
      const y = r - r0, x = c - c0;
      if (y === 0 || y === 6 || x === 0 || x === 6) return 1;
      if (y >= 2 && y <= 4 && x >= 2 && x <= 4) return 1;
      return 0;
    }
  }
  if ((r === 7 && (c <= 7 || c >= 13)) || (c === 7 && (r <= 7 || r >= 13)) || (r === 13 && c <= 7) || (c === 13 && r <= 7)) return 0;
  return -1;
};
export const qr: { bg: string }[] = [];
for (let r = 0; r < N; r++) {
  for (let c = 0; c < N; c++) {
    let v = finder(r, c);
    if (v === -1) v = (((r * 31 + c * 17) * 9301 + 49297) % 233280) / 233280 < 0.48 ? 1 : 0;
    qr.push({ bg: v ? '#1A1A1A' : '#FFFFFF' });
  }
}

export const faq = [
  { q: 'Which devices work with SITE14?', a: 'Phones, tablets, watches, laptops, desktops and GPS trackers. Most crews start with the phones they already carry and add watches or trackers later.' },
  { q: 'Do workers need to install an app?', a: 'No. They scan the QR code you show them, or type the pairing code, and the device starts sending its location from the browser. iPhone users can also use the SITE14 app.' },
  { q: 'How often is location updated?', a: 'Every 5 seconds while the device is on site, so the live map and zone times stay current.' },
  { q: 'What triggers an alert?', a: 'Leaving the zone they are working in. The worker turns red on the live map and an alert stays open until someone acknowledges it.' },
  { q: 'How do I know a report has not been edited?', a: 'Every PDF carries a SHA-256 fingerprint. Drop the file back into SITE14 and it tells you whether it matches the report that was issued, and when.' },
  { q: 'Can I import my existing worker list?', a: 'Yes. Download the CSV template, fill it in and upload it. Each row becomes a worker you can give a device and a site.' },
  { q: 'Who on my team can sign in?', a: 'Invite people by email as a company admin or a site manager. Each person has their own account, and you can deactivate it at any time.' },
  { q: 'What if a device goes offline?', a: 'It shows as Offline in your device list with the time it was last seen, and its battery level is reported while it is connected.' }
];

export const dissolve: { bg: string }[] = [];
const rows = 5, cols = 48;
for (let r = 0; r < rows; r++) {
  for (let c = 0; c < cols; c++) {
    const n = ((r * cols + c) * 9301 + 49297) % 233280 / 233280;
    const p = (r + 1) / (rows + 1);
    dissolve.push({ bg: n < p ? 'var(--l-alt)' : (n < p + 0.12 ? 'var(--l-alt2)' : 'transparent') });
  }
}

export const watchCells = toCells(watch, pal, 14);
