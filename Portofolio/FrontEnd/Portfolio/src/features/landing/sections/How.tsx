import { dissolve, steps } from "../landingData";
import { Reveal } from "../components/Reveal";

export function How() {
  return (
    <section id="how" className="relative bg-(--l-bg) pt-30">
      <Reveal className="wrap flex flex-col items-center text-center">
        <p className="text-[12px] font-semibold tracking-[.08em] text-[#B93A07]">HOW IT WORKS</p>
        <h2 className="mt-3.5 font-semibold text-[clamp(30px,_3.4vw,_44px)] tracking-[-0.035em] leading-[1.1]">Carry it. Work. It is recorded.</h2>
        <div className="how-lines mt-16 flex flex-col items-center gap-2.5 text-[clamp(20px,_2.3vw,_30px)] leading-[1.4] tracking-[-0.02em] text-(--l-fg)">
          <p className="m-0 flex items-center justify-center gap-3.5 flex-wrap">Every worker carries a phone or wears a watch<svg role="img" aria-label="watch" width="22" height="30" viewBox="0 0 6 8" shapeRendering="crispEdges" className="flex-none"><rect x="2" y="0" width="2" height="2" fill="currentColor"></rect><rect x="2" y="6" width="2" height="2" fill="currentColor"></rect><rect x="1" y="2" width="4" height="4" fill="currentColor"></rect><rect x="2" y="3" width="2" height="2" fill="#5FBF86"></rect></svg></p>
          <p className="m-0 flex items-center justify-center gap-3.5 flex-wrap">When they step into their zone, their hours start counting<svg role="img" aria-label="clock" width="30" height="30" viewBox="0 0 8 8" shapeRendering="crispEdges" className="flex-none"><g fill="currentColor"><rect x="2" y="0" width="4" height="1"></rect><rect x="1" y="1" width="1" height="1"></rect><rect x="6" y="1" width="1" height="1"></rect><rect x="0" y="2" width="1" height="4"></rect><rect x="7" y="2" width="1" height="4"></rect><rect x="1" y="6" width="1" height="1"></rect><rect x="6" y="6" width="1" height="1"></rect><rect x="2" y="7" width="4" height="1"></rect><rect x="3" y="2" width="1" height="3"></rect><rect x="4" y="4" width="2" height="1"></rect></g></svg></p>
          <p className="m-0 flex items-center justify-center gap-3.5 flex-wrap">If they walk out of it, you see an alert on the map<svg role="img" aria-label="alert" width="30" height="30" viewBox="0 0 8 8" shapeRendering="crispEdges" className="flex-none"><g fill="#B42318"><rect x="3" y="0" width="2" height="1"></rect><rect x="2" y="1" width="4" height="1"></rect><rect x="1" y="2" width="6" height="3"></rect><rect x="0" y="5" width="8" height="1"></rect><rect x="3" y="6" width="2" height="1"></rect></g></svg></p>
          <p className="m-0 flex items-center justify-center gap-3.5 flex-wrap">Record it all, and generate reports of your whole operation<svg role="img" aria-label="report" width="26" height="30" viewBox="0 0 7 8" shapeRendering="crispEdges" className="flex-none"><g fill="currentColor"><rect x="0" y="0" width="5" height="1"></rect><rect x="0" y="1" width="1" height="7"></rect><rect x="1" y="7" width="6" height="1"></rect><rect x="6" y="2" width="1" height="5"></rect><rect x="5" y="1" width="1" height="1"></rect></g><g fill="#2F7D4F"><rect x="2" y="3" width="3" height="1"></rect><rect x="2" y="5" width="2" height="1"></rect></g></svg></p>
        </div>
        <ol className="list-none mt-18 w-full grid grid-cols-[repeat(auto-fit,_minmax(min(200px,_100%),_1fr))] gap-0 border-t border-t-(--l-line) text-left">
          {steps.map((st) => (
            <li key={st.n} className="pt-7 pb-2 pr-6 flex flex-col gap-3">
              <span className="font-pixel text-[28px] text-[#B93A07] leading-none">{st.n}</span>
              <span className="text-[17px] font-semibold tracking-[-0.015em]">{st.title}</span>
              <span className="text-[14px] leading-[1.55] text-(--l-muted) max-w-[250px]">{st.body}</span>
            </li>
          ))}
        </ol>
      </Reveal>
      <div aria-hidden="true" className="grid grid-cols-48 mt-30">
        {dissolve.map((d, i) => (
          <div key={i} className="aspect-square" style={{ background: d.bg }}></div>
        ))}
      </div>
    </section>
  );
}
