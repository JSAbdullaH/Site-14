import { stamps } from "../landingData";
import { PixelGrid } from "../components/PixelGrid";
import { Reveal } from "../components/Reveal";

export function Why() {
  return (
    <section id="why" className="bg-(--l-bg) pt-25 pb-30">
      <Reveal className="wrap flex flex-col items-center text-center">
        <p className="text-[12px] font-semibold tracking-[.08em] text-[#B93A07]">WHY SITE14</p>
        <h2 className="mt-3.5 font-semibold text-[clamp(30px,_3.4vw,_44px)] tracking-[-0.035em] leading-[1.08] max-w-[560px]">Built for the site, not the office</h2>
        <p className="mt-5.5 max-w-[380px] text-[15px] leading-[1.5] text-(--l-muted)">Attendance, zones and hours recorded as they happen, and kept exactly that way.</p>
        <div className="flex flex-wrap justify-center gap-7 mt-16 w-full">
          {stamps.map((s, i) => (
            <Reveal key={s.title} className="stamp relative flex-[1_1_280px] max-w-[340px] bg-(--l-stamp) pt-7.5 pb-6.5 px-6.5 box-border text-left flex flex-col gap-4.5" style={{ transitionDelay: `${i * 120}ms` }}>
              <div aria-hidden="true" className="holes-x top-[-7px]"></div>
              <div aria-hidden="true" className="holes-x bottom-[-7px]"></div>
              <div aria-hidden="true" className="holes-y left-[-7px]"></div>
              <div aria-hidden="true" className="holes-y right-[-7px]"></div>
              <div className="font-pixel" style={{ color: s.color }}>
                <div className="text-[32px] leading-none tracking-[.01em]">{s.title}</div>
                <div className="text-[21px] mt-2">{s.sub}</div>
              </div>
              <div className="dots h-[250px] flex items-center justify-center box-border overflow-hidden">
                <PixelGrid cells={s.cells} cols={s.cols} size={s.size} gap={1} label={s.alt} />
              </div>
              <div className="flex justify-between items-baseline gap-3">
                <span className="font-pixel text-[20px] tracking-[.04em]" style={{ color: s.color }}>{s.label}</span>
              </div>
            </Reveal>
          ))}
        </div>
      </Reveal>
    </section>
  );
}
