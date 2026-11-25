import { Link } from "react-router-dom";
import { accent } from "../landingData";
import { Reveal } from "../components/Reveal";

export function Cta() {
  return (
    <section className="band after-panels relative overflow-hidden bg-[#1A1A1A] py-30">
      <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(40%_70%_at_50%_120%,_rgba(219,68,6,.45)_0%,_transparent_70%)]"></div>
      <Reveal className="wrap relative flex flex-col items-center text-center">
        <h2 className="font-semibold text-[clamp(30px,_3.6vw,_48px)] tracking-[-0.035em] leading-[1.08] text-[#fff] max-w-[680px]">Put your site <span className="font-pixel font-medium" style={{ color: accent }}>on the map</span> today.</h2>
        <p className="mt-5 max-w-[460px] text-[15px] leading-[1.55] text-[rgba(255,255,255,.78)]">Pair a phone or watch with a QR code, or order ready-to-go devices from the marketplace. They connect on first power-on.</p>
        <div className="flex flex-wrap justify-center gap-2 mt-8">
          <Link to="/signin" className="l-btn l-btn-primary">Create your company account</Link>
          <a href="#devices" className="l-btn l-btn-secondary">Browse devices</a>
        </div>
      </Reveal>
    </section>
  );
}
