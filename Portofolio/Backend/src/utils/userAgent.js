const DEVICE_TYPES = ['phone', 'tablet', 'watch', 'laptop', 'desktop', 'tracker'];

const COMPATIBLE = {
  phone: ['phone', 'watch', 'tablet'],
  tablet: ['tablet', 'phone'],
  watch: ['watch', 'phone'],
  computer: ['laptop', 'desktop', 'tablet'],
  unknown: ['phone', 'tablet', 'watch', 'laptop', 'desktop'],
};

const ANDROID_VENDORS = [
  [/^SM-|^GT-|^Galaxy/i, 'Samsung'],
  [/^Pixel/i, 'Google'],
  [/^(HUAWEI|ELE-|VOG-|LYA-|NOH-|ANA-)/i, 'Huawei'],
  [/^(Redmi|POCO|Mi |M2\d{3}|2\d{3}[A-Z0-9]{3,})/i, 'Xiaomi'],
  [/^(CPH|OPPO)/i, 'OPPO'],
  [/^(RMX|realme)/i, 'realme'],
  [/^(vivo|V\d{4})/i, 'vivo'],
  [/^(ONEPLUS|[A-Z]{2}\d{4}$)/i, 'OnePlus'],
  [/^(moto|XT\d{4})/i, 'Motorola'],
  [/^(Nokia|TA-\d{4})/i, 'Nokia'],
  [/^(LM-|LG-)/i, 'LG'],
  [/^(XQ-|SO-|G8\d{3})/i, 'Sony'],
  [/^(TECNO|Infinix|itel)/i, 'Transsion'],
];

const clean = (value, max) => {
  if (typeof value !== 'string') return null;
  const text = value.replace(/[\u0000-\u001f\u007f"]/g, '').trim();
  return text ? text.slice(0, max) : null;
};

const FROZEN_VERSIONS = new Set(['10.15.7', '10.15']);

const dotted = (v) => (v ? v.replace(/_/g, '.') : null);

function parseOs(ua) {
  let m;
  if ((m = ua.match(/watchOS[ /]([\d_.]+)/i))) return { name: 'watchOS', version: dotted(m[1]) };
  if (/Wear ?OS|wearos/i.test(ua)) return { name: 'Wear OS', version: (ua.match(/Android ([\d.]+)/) || [])[1] || null };
  if ((m = ua.match(/Tizen[ /]?([\d.]+)?/i))) return { name: 'Tizen', version: m[1] || null };
  if ((m = ua.match(/HarmonyOS[ /]?([\d.]+)?/i))) return { name: 'HarmonyOS', version: m[1] || null };
  if ((m = ua.match(/\biPad.*?OS ([\d_]+)/))) return { name: 'iPadOS', version: dotted(m[1]) };
  if ((m = ua.match(/\b(?:iPhone|iPod).*?OS ([\d_]+)/))) return { name: 'iOS', version: dotted(m[1]) };
  if ((m = ua.match(/Android ([\d.]+)/))) return { name: 'Android', version: m[1] };
  if (/Android/.test(ua)) return { name: 'Android', version: null };
  if ((m = ua.match(/Windows NT ([\d.]+)/))) return { name: 'Windows', version: m[1] === '10.0' ? '10' : m[1] };
  if ((m = ua.match(/CrOS \S+ ([\d.]+)/))) return { name: 'ChromeOS', version: m[1] };
  if ((m = ua.match(/Mac OS X ([\d_.]+)/))) return { name: 'macOS', version: dotted(m[1]) };
  if (/Macintosh/.test(ua)) return { name: 'macOS', version: null };
  if (/Linux/.test(ua)) return { name: 'Linux', version: null };
  return { name: null, version: null };
}

function parseBrowser(ua) {
  const rules = [
    [/EdgA?\/([\d.]+)/, 'Edge'],
    [/EdgiOS\/([\d.]+)/, 'Edge'],
    [/OPR\/([\d.]+)/, 'Opera'],
    [/SamsungBrowser\/([\d.]+)/, 'Samsung Internet'],
    [/YaBrowser\/([\d.]+)/, 'Yandex'],
    [/CriOS\/([\d.]+)/, 'Chrome'],
    [/FxiOS\/([\d.]+)/, 'Firefox'],
    [/Firefox\/([\d.]+)/, 'Firefox'],
    [/Chrome\/([\d.]+)/, 'Chrome'],
    [/Version\/([\d.]+).*Safari/, 'Safari'],
  ];
  for (const [pattern, name] of rules) {
    const m = ua.match(pattern);
    if (m) return `${name} ${m[1].split('.')[0]}`;
  }
  return null;
}

function parseHardware(ua) {
  if (/\biPhone/.test(ua)) return { manufacturer: 'Apple', model: 'iPhone' };
  if (/\biPad/.test(ua)) return { manufacturer: 'Apple', model: 'iPad' };
  if (/\biPod/.test(ua)) return { manufacturer: 'Apple', model: 'iPod touch' };
  if (/\bWatch/.test(ua) && /AppleWebKit/.test(ua) && !/Android/.test(ua)) return { manufacturer: 'Apple', model: 'Apple Watch' };
  if (/Macintosh/.test(ua)) return { manufacturer: 'Apple', model: 'Mac' };
  const m = ua.match(/Android[^;)]*;(?: [a-z]{2}[-_][a-z]{2};)? ([^;)]+?)(?: Build\/[^;)]*)?\)/i);
  const model = m && m[1].trim() !== 'K' ? m[1].trim() : null;
  if (!model) return { manufacturer: null, model: null };
  const vendor = ANDROID_VENDORS.find(([pattern]) => pattern.test(model));
  return { manufacturer: vendor ? vendor[1] : null, model };
}

function classify(ua, hints) {
  if (/watchOS|Wear ?OS|wearos|\bWatch\b|SM-R\d{3}|Tizen.*(Wearable|Watch)/i.test(ua)) return 'watch';
  if (/\biPad|Tablet|PlayBook|Silk\//i.test(ua)) return 'tablet';
  if (/Android/.test(ua) && !/Mobile/.test(ua)) return 'tablet';
  if (hints.mobile === true || /\biPhone|\biPod|Mobile|IEMobile|Windows Phone/i.test(ua)) return 'phone';
  if (/Windows NT|Macintosh|CrOS|X11|Linux x86_64/.test(ua)) return 'computer';
  return 'unknown';
}

function readHints(headers) {
  const strip = (v) => (typeof v === 'string' ? v.replace(/^"|"$/g, '') : null);
  return {
    mobile: headers['sec-ch-ua-mobile'] === '?1' ? true : headers['sec-ch-ua-mobile'] === '?0' ? false : null,
    platform: strip(headers['sec-ch-ua-platform']),
    platformVersion: strip(headers['sec-ch-ua-platform-version']),
    model: strip(headers['sec-ch-ua-model']),
  };
}

function windowsVersion(platformVersion) {
  const major = Number(String(platformVersion || '').split('.')[0]);
  if (!Number.isFinite(major) || major === 0) return null;
  return major >= 13 ? '11' : '10';
}

function detectDevice(headers, reported = {}) {
  const ua = clean(headers['user-agent'], 512) || '';
  const hints = readHints(headers);
  const os = parseOs(ua);
  const hardware = parseHardware(ua);
  const family = classify(ua, hints);

  const touchMac = family === 'computer' && os.name === 'macOS' && reported.touch_points > 1;
  const allowed = touchMac ? ['tablet'] : COMPATIBLE[family];
  const fallback = touchMac ? 'tablet' : family === 'computer' ? (reported.has_battery ? 'laptop' : 'desktop') : family === 'unknown' ? 'phone' : family;
  const deviceType = allowed.includes(reported.device_type) ? reported.device_type : fallback;

  const reportedModel = clean(reported.model || hints.model, 80);
  const platformVersion = reported.platform_version || hints.platformVersion;
  const reducedAndroid = /Android 10; K\)/.test(ua);
  let osName = touchMac ? 'iPadOS' : os.name;
  let osVersion = os.version;
  if (FROZEN_VERSIONS.has(osVersion)) osVersion = null;
  if (osName === 'Windows') osVersion = windowsVersion(platformVersion) || osVersion;
  if ((osName === 'macOS' || osName === 'iPadOS' || reducedAndroid || !osVersion) && platformVersion && osName !== 'Windows') {
    osVersion = clean(platformVersion.replace(/(\.0)+$/, ''), 40);
  }

  const manufacturer = hardware.manufacturer || (reportedModel && (ANDROID_VENDORS.find(([p]) => p.test(reportedModel)) || [])[1]) || null;
  let model = touchMac ? 'iPad' : reportedModel || hardware.model;
  if (model === 'Mac') model = deviceType === 'laptop' ? 'MacBook' : 'Mac';

  return {
    deviceType,
    manufacturer: clean(manufacturer, 60),
    model: clean(model, 80),
    osName: clean(osName, 40),
    osVersion: clean(osVersion, 40),
    browser: clean(parseBrowser(ua), 60),
    userAgent: ua || null,
  };
}

const TYPE_LABEL = { phone: 'Phone', tablet: 'Tablet', watch: 'Watch', laptop: 'Laptop', desktop: 'Desktop', tracker: 'Tracker' };

function defaultName(d) {
  const brand = [d.manufacturer, d.model].filter(Boolean);
  if (brand.length === 2 && (d.manufacturer === 'Apple' || d.model.startsWith(d.manufacturer))) brand.shift();
  if (brand.length) return brand.join(' ').slice(0, 80);
  return [d.osName, TYPE_LABEL[d.deviceType]].filter(Boolean).join(' ').slice(0, 80);
}

module.exports = { DEVICE_TYPES, detectDevice, defaultName };
