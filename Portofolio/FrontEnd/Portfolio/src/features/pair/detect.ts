import type { DeviceType } from "@/shared/lib/deviceTypes";
import type { DetectedDevice } from "./types";

type BatteryManager = { level: number; charging: boolean; chargingTime: number; dischargingTime: number };

type UAData = {
  mobile?: boolean;
  platform?: string;
  getHighEntropyValues?: (hints: string[]) => Promise<{ model?: string; platformVersion?: string; platform?: string }>;
};

type NavigatorExtras = Navigator & {
  userAgentData?: UAData;
  getBattery?: () => Promise<BatteryManager>;
};

const nav = () => navigator as NavigatorExtras;

export async function readBattery(): Promise<BatteryManager | null> {
  try {
    return (await nav().getBattery?.()) ?? null;
  } catch {
    return null;
  }
}

function hasRealBattery(b: BatteryManager | null) {
  if (!b) return false;
  return !(b.charging && b.level === 1 && b.chargingTime === 0 && b.dischargingTime === Infinity);
}

function guessType(ua: string, touch: number, battery: boolean): { guess: DeviceType; choices: DeviceType[] } {
  if (/watchOS|Wear ?OS|wearos|\bWatch\b|SM-R\d{3}|Tizen/i.test(ua)) return { guess: "watch", choices: ["watch", "phone"] };
  if (/\biPad|Tablet/i.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua))) return { guess: "tablet", choices: ["tablet", "phone"] };
  if (/Macintosh/.test(ua) && touch > 1) return { guess: "tablet", choices: ["tablet"] };
  if (/\biPhone|\biPod|Mobile|Android/i.test(ua)) return { guess: "phone", choices: ["phone", "watch", "tablet"] };
  return { guess: battery ? "laptop" : "desktop", choices: ["laptop", "desktop"] };
}

function osLabel(ua: string, version?: string) {
  const ios = ua.match(/OS (\d+)_(\d+)/);
  if (/\biPhone|\biPad/.test(ua) && ios) return `${/\biPad/.test(ua) ? "iPadOS" : "iOS"} ${ios[1]}.${ios[2]}`;
  const android = ua.match(/Android ([\d.]+)/);
  if (android) return `Android ${version && android[1] === "10" ? version.split(".")[0] : android[1]}`;
  if (/Windows NT/.test(ua)) return version && Number(version.split(".")[0]) >= 13 ? "Windows 11" : "Windows";
  if (/CrOS/.test(ua)) return "ChromeOS";
  if (/Macintosh/.test(ua)) return version ? `macOS ${version.replace(/(\.0)+$/, "")}` : "macOS";
  if (/Linux/.test(ua)) return "Linux";
  return null;
}

function browserLabel(ua: string) {
  const rules: [RegExp, string][] = [
    [/Edg(A|iOS)?\//, "Edge"],
    [/OPR\//, "Opera"],
    [/SamsungBrowser\//, "Samsung Internet"],
    [/CriOS\/|Chrome\//, "Chrome"],
    [/FxiOS\/|Firefox\//, "Firefox"],
    [/Safari\//, "Safari"],
  ];
  return rules.find(([pattern]) => pattern.test(ua))?.[1] ?? null;
}

export async function detectThisDevice(): Promise<DetectedDevice> {
  const ua = navigator.userAgent;
  const touch = navigator.maxTouchPoints || 0;
  const [battery, hints] = await Promise.all([
    readBattery(),
    nav().userAgentData?.getHighEntropyValues?.(["model", "platformVersion"]).catch(() => undefined),
  ]);
  const realBattery = hasRealBattery(battery);
  const { guess, choices } = guessType(ua, touch, realBattery);
  const model = hints?.model || (/\biPhone/.test(ua) ? "iPhone" : /\biPad/.test(ua) || (guess === "tablet" && /Macintosh/.test(ua)) ? "iPad" : undefined);
  const summary = [model, osLabel(ua, hints?.platformVersion), browserLabel(ua)].filter(Boolean).join(" · ");

  return {
    guess,
    choices,
    summary,
    device_type: guess,
    model: hints?.model || undefined,
    platform_version: hints?.platformVersion || undefined,
    touch_points: touch,
    has_battery: realBattery,
    battery_percent: battery ? Math.round(battery.level * 100) : null,
  };
}
