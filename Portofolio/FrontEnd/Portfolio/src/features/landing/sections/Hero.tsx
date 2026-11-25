import { Link } from "react-router-dom";
import ThemeToggle from "@/shared/components/ThemeToggle";
import { accent } from "../landingData";
import { Reveal } from "../components/Reveal";

export function Hero() {
  return (
    <header className="relative overflow-hidden min-h-[820px] bg-(--h-bg)">
      <nav className="wrap relative grid grid-cols-[1fr_auto_1fr] items-center gap-6 pt-7" aria-label="Main">
        <span aria-hidden="true" />
        <div className="nav-links text-[13px] text-(--h-nav)">
          <a href="#features">Product</a>
          <a href="#how">How it works</a>
          <a href="#devices">Devices</a>
          <a href="#faq">FAQ</a>
        </div>
        <div className="justify-self-end flex items-center gap-2">
          <ThemeToggle className="text-[var(--h-nav)] hover:bg-[var(--h-glass)] hover:text-[var(--h-fg)]" />
          <Link to="/signin" className="l-btn l-btn-sm l-btn-secondary glass hide-sm">Sign in</Link>
          <Link to="/signin" className="l-btn l-btn-sm l-btn-primary">Sign up</Link>
        </div>
      </nav>
      <Reveal className="wrap relative flex flex-col items-center text-center pt-30 pb-37.5">
        <h1 className="font-semibold text-[clamp(40px,_5.4vw,_74px)] leading-[1.04] tracking-[-0.04em] text-(--h-fg) max-w-[1120px] text-balance">
          Know what happened on site.<br />
          <span className="font-pixel font-medium tracking-[-0.01em]" style={{ color: accent }}>Not what was written later.</span>
        </h1>
        <p className="mt-7 max-w-[520px] text-[16px] leading-[1.55] text-(--h-sub)">SITE14 records attendance, zones and hours as they happen in the field, so the daily record is the work itself and not a form filled in afterwards.</p>
        <div className="flex flex-wrap justify-center gap-2 mt-8.5">
          <Link to="/signin" className="l-btn l-btn-primary">Create your company account</Link>
          <a href="#features" className="l-btn l-btn-secondary glass">
            <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"></path><circle cx="12" cy="9.5" r="2.5"></circle></svg>
            See the live map
          </a>
        </div>
      </Reveal>
      <div aria-hidden="true" className="absolute left-0 right-0 bottom-0 h-[180px] bg-[linear-gradient(to_bottom,_transparent,_var(--l-bg))]"></div>
    </header>
  );
}
