import { Laptop, Monitor, Radio, Smartphone, Tablet, Watch } from "lucide-react";
import type { LucideProps } from "lucide-react";
import type { DeviceType } from "@/shared/lib/deviceTypes";

const ICONS = {
  phone: Smartphone,
  tablet: Tablet,
  watch: Watch,
  laptop: Laptop,
  desktop: Monitor,
  tracker: Radio,
} as const;

type Props = LucideProps & { type: DeviceType };

export default function DeviceIcon({ type, ...rest }: Props) {
  const Icon = ICONS[type] ?? Radio;
  return <Icon aria-hidden="true" {...rest} />;
}
