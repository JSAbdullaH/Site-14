import { Link } from "react-router-dom";
import { Wordmark } from "@/shared/components/Wordmark";
import { Reveal } from "../components/Reveal";

export function Footer() {
  return (
    <footer className="after-panels bg-[#141414] text-[rgba(255,255,255,.7)] pt-18 pb-9 border-t border-t-[rgba(255,255,255,.08)]">
      <Reveal className="wrap flex flex-col gap-14">
        <div className="flex flex-wrap gap-12 justify-between">
          <div className="flex-[1_1_260px] max-w-[320px] flex flex-col gap-3.5">
            <Link to="/" aria-label="SITE14 home" className="self-start text-[#F4F3EF]"><Wordmark height={36} label="SITE14" /></Link>
            <p className="text-[13.5px] leading-[1.55]">Live attendance, zones and hours for construction sites, recorded as the work happens.</p>
          </div>
          <div className="flex-[2_1_480px] grid grid-cols-[repeat(auto-fit,_minmax(140px,_1fr))] gap-8 text-[13.5px]">
            <div className="flex flex-col gap-3">
              <span className="text-[12px] font-semibold tracking-[.06em] text-[#fff]">PRODUCT</span>
              <a href="#features">Live map</a>
              <a href="#features">History</a>
              <a href="#features">Reports</a>
              <a href="#features">Tasks</a>
            </div>
            <div className="flex flex-col gap-3">
              <span className="text-[12px] font-semibold tracking-[.06em] text-[#fff]">DEVICES</span>
              <a href="#devices">Connect a device</a>
            </div>
            <div className="flex flex-col gap-3">
              <span className="text-[12px] font-semibold tracking-[.06em] text-[#fff]">ACCOUNT</span>
              <Link to="/signin">Sign in</Link>
              <Link to="/signin">Sign up</Link>
              <a href="#faq">FAQ</a>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap justify-between gap-4 pt-6 border-t border-t-[rgba(255,255,255,.08)] text-[12.5px]">
          <span>© 2026 SITE14</span>
          <span>Riyadh, Saudi Arabia</span>
        </div>
      </Reveal>
    </footer>
  );
}
