import { faq } from "../landingData";
import { Reveal } from "../components/Reveal";

export function Faq() {
  return (
    <section className="after-panels bg-(--l-bg) py-30" id="faq">
      <Reveal className="wrap max-w-[1060px] flex flex-wrap gap-14">
        <div className="flex-[1_1_280px]">
          <p className="text-[12px] font-semibold tracking-[.08em] text-[#B93A07]">FAQ</p>
          <h2 className="mt-3.5 font-semibold text-[clamp(30px,_3.4vw,_44px)] tracking-[-0.035em] leading-[1.08]">Questions from the site office.</h2>
          <p className="mt-4.5 max-w-[300px] text-[15px] leading-[1.55] text-(--l-muted)">Something else? Create an account and try it on your own site.</p>
        </div>
        <div className="faq flex-[999_1_520px] min-w-0 flex flex-col border-t border-t-(--l-line)">
          {faq.map((fq) => (
            <details key={fq.q} className="border-b border-b-(--l-line)">
              <summary className="flex items-center justify-between gap-4 min-h-[64px] py-4 box-border text-[16px] font-semibold tracking-[-0.01em]">
                {fq.q}
                <svg className="plus flex-none" aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14"></path><path d="M5 12h14"></path></svg>
              </summary>
              <p className="pb-5.5 pr-10 text-[15px] leading-[1.6] text-(--l-body)">{fq.a}</p>
            </details>
          ))}
        </div>
      </Reveal>
    </section>
  );
}
