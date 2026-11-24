import { Fragment, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import ThemeToggle from "@/shared/components/ThemeToggle";
import { accent, landing } from "./landingData";
import "./landing.css";

function useReveal() {
  useEffect(() => {
    const items = document.querySelectorAll<HTMLElement>(".landing [data-reveal]");
    if (!("IntersectionObserver" in window)) {
      items.forEach((el) => el.classList.add("in"));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
    );
    items.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);
}

function useFeatureScene() {
  const [active, setActive] = useState(0);
  useEffect(() => {
    const scene = document.querySelector<HTMLElement>(".landing .feature-scene");
    if (!scene) return;
    const update = () => {
      const rect = scene.getBoundingClientRect();
      const travel = scene.offsetHeight - window.innerHeight;
      if (travel <= 0) return;
      const progress = Math.min(Math.max(-rect.top / travel, 0), 0.9999);
      setActive(Math.floor(progress * 4));
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);
  const featureState = (n: number) => (n === active ? "is-active" : n < active ? "is-before" : "is-after");
  return { active, featureState };
}

export default function Landing() {
  const { stamps, dissolve, steps, tasks, qr, faq, watchCells } = landing;
  const { active, featureState } = useFeatureScene();
  useReveal();

  return (
    <div className="landing" style={{ fontFamily: '\'Geist Variable\', \'Geist\', system-ui, sans-serif', color: 'var(--l-fg)', background: 'var(--l-bg)', minHeight: '100vh' }}>
      <header style={{ position: 'relative', overflow: 'hidden', minHeight: '820px', background: 'var(--h-bg)' }}>
        <nav className="wrap" aria-label="Main" style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: '24px', paddingTop: '28px' }}>
          <Link to="/" style={{ justifySelf: 'start', fontSize: '20px', fontWeight: '700', letterSpacing: '-0.02em', color: 'var(--h-fg)' }}>SITE<span style={{ color: accent }}>14</span></Link>
          <div className="nav-links" style={{ fontSize: '13px', color: 'var(--h-nav)' }}>
            <a href="#features">Product</a>
            <a href="#how">How it works</a>
            <a href="#devices">Devices</a>
            <a href="#faq">FAQ</a>
          </div>
          <div style={{ justifySelf: 'end', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ThemeToggle className="text-[var(--h-nav)] hover:bg-[var(--h-glass)] hover:text-[var(--h-fg)]" />
            <Link to="/signin" className="l-btn l-btn-sm l-btn-secondary glass hide-sm">Sign in</Link>
            <Link to="/signin" className="l-btn l-btn-sm l-btn-primary">Sign up</Link>
          </div>
        </nav>
        <div className="wrap" data-reveal style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', paddingTop: '120px', paddingBottom: '150px' }}>
          <div className="glass" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 12px', borderRadius: '999px', background: 'var(--h-glass)', border: '1px solid var(--h-glass-border)', color: 'rgba(255,255,255,.9)', fontSize: '12px', fontWeight: '500' }}>
            <span aria-hidden="true" style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#5FBF86' }}></span>
            Live operations management and tracking
          </div>
          <h1 style={{ margin: '26px 0 0', fontWeight: '600', fontSize: 'clamp(40px, 5.4vw, 74px)', lineHeight: '1.04', letterSpacing: '-0.04em', color: 'var(--h-fg)', maxWidth: '1120px', textWrap: 'balance' }}>
            Know what happened on site.<br />
            <span style={{ fontFamily: '\'Pixelify Sans\', monospace', fontWeight: '500', letterSpacing: '-0.01em', color: accent }}>Not what was written later.</span>
          </h1>
          <p style={{ margin: '28px 0 0', maxWidth: '520px', fontSize: '16px', lineHeight: '1.55', color: 'var(--h-sub)' }}>SITE14 records attendance, zones and hours as they happen in the field, so the daily record is the work itself and not a form filled in afterwards.</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '8px', marginTop: '34px' }}>
            <Link to="/signin" className="l-btn l-btn-primary">Create your company account</Link>
            <a href="#features" className="l-btn l-btn-secondary glass">
              <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"></path><circle cx="12" cy="9.5" r="2.5"></circle></svg>
              See the live map
            </a>
          </div>
        </div>
        <div aria-hidden="true" style={{ position: 'absolute', left: '0', right: '0', bottom: '0', height: '180px', background: 'linear-gradient(to bottom, transparent, var(--l-bg))' }}></div>
      </header>
      <section id="why" style={{ background: 'var(--l-bg)', padding: '100px 0 120px' }}>
        <div className="wrap" data-reveal style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <p style={{ margin: '0', fontSize: '12px', fontWeight: '600', letterSpacing: '.08em', color: '#B93A07' }}>WHY SITE14</p>
          <h2 style={{ margin: '14px 0 0', fontWeight: '600', fontSize: 'clamp(30px, 3.4vw, 44px)', letterSpacing: '-0.035em', lineHeight: '1.08', maxWidth: '560px' }}>Built for the site, not the office</h2>
          <p style={{ margin: '22px 0 0', maxWidth: '380px', fontSize: '15px', lineHeight: '1.5', color: 'var(--l-muted)' }}>Attendance, zones and hours recorded as they happen, and kept exactly that way.</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '28px', marginTop: '64px', width: '100%' }}>
            {stamps.map((s, i4) => (<Fragment key={i4}>
              <div className="stamp" data-reveal style={{ transitionDelay: `${i4 * 120}ms`, position: 'relative', flex: '1 1 280px', maxWidth: '340px', background: 'var(--l-stamp)', padding: '30px 26px 26px', boxSizing: 'border-box', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '18px' }}>
                <div aria-hidden="true" className="holes-x" style={{ top: '-7px' }}></div>
                <div aria-hidden="true" className="holes-x" style={{ bottom: '-7px' }}></div>
                <div aria-hidden="true" className="holes-y" style={{ left: '-7px' }}></div>
                <div aria-hidden="true" className="holes-y" style={{ right: '-7px' }}></div>
                <div style={{ fontFamily: '\'Pixelify Sans\', monospace', color: s.color }}>
                  <div style={{ fontSize: '32px', lineHeight: '1', letterSpacing: '.01em' }}>{s.title}</div>
                  <div style={{ fontSize: '21px', marginTop: '8px' }}>{s.sub}</div>
                </div>
                <div className="dots" style={{ height: '250px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box', overflow: 'hidden' }}>
                  <div role="img" aria-label={s.alt} style={{ display: 'grid', gridTemplateColumns: `repeat(${s.cols}, ${s.size}px)`, gridAutoRows: `${s.size}px`, gap: '1px' }}>
                    {s.cells.map((c, i5) => (<Fragment key={i5}>
                      <div style={{ background: c.bg }}></div>
                    </Fragment>))}
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px' }}>
                  <span style={{ fontFamily: '\'Pixelify Sans\', monospace', fontSize: '20px', letterSpacing: '.04em', color: s.color }}>{s.label}</span>
                  <span style={{ fontSize: '12px', color: 'var(--l-muted)', textAlign: 'right' }}>{s.note}</span>
                </div>
              </div>
            </Fragment>))}
          </div>
        </div>
      </section>
      <section id="how" style={{ position: 'relative', background: 'var(--l-bg)', padding: '120px 0 0' }}>
        <div className="wrap" data-reveal style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <p style={{ margin: '0', fontSize: '12px', fontWeight: '600', letterSpacing: '.08em', color: '#B93A07' }}>HOW IT WORKS</p>
          <h2 style={{ margin: '14px 0 0', fontWeight: '600', fontSize: 'clamp(30px, 3.4vw, 44px)', letterSpacing: '-0.035em', lineHeight: '1.1' }}>Carry it. Work. It is recorded.</h2>
          <div className="how-lines" style={{ margin: '64px 0 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', fontSize: 'clamp(20px, 2.3vw, 30px)', lineHeight: '1.4', letterSpacing: '-0.02em', color: 'var(--l-fg)' }}>
            <p style={{ margin: '0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '14px', flexWrap: 'wrap' }}>Every worker carries a phone or wears a watch<svg role="img" aria-label="watch" width="22" height="30" viewBox="0 0 6 8" shapeRendering="crispEdges" style={{ flex: 'none' }}><rect x="2" y="0" width="2" height="2" fill="currentColor"></rect><rect x="2" y="6" width="2" height="2" fill="currentColor"></rect><rect x="1" y="2" width="4" height="4" fill="currentColor"></rect><rect x="2" y="3" width="2" height="2" fill="#5FBF86"></rect></svg></p>
            <p style={{ margin: '0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '14px', flexWrap: 'wrap' }}>When they step into their zone, their hours start counting<svg role="img" aria-label="clock" width="30" height="30" viewBox="0 0 8 8" shapeRendering="crispEdges" style={{ flex: 'none' }}><g fill="currentColor"><rect x="2" y="0" width="4" height="1"></rect><rect x="1" y="1" width="1" height="1"></rect><rect x="6" y="1" width="1" height="1"></rect><rect x="0" y="2" width="1" height="4"></rect><rect x="7" y="2" width="1" height="4"></rect><rect x="1" y="6" width="1" height="1"></rect><rect x="6" y="6" width="1" height="1"></rect><rect x="2" y="7" width="4" height="1"></rect><rect x="3" y="2" width="1" height="3"></rect><rect x="4" y="4" width="2" height="1"></rect></g></svg></p>
            <p style={{ margin: '0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '14px', flexWrap: 'wrap' }}>If they walk out of it, you see an alert on the map<svg role="img" aria-label="alert" width="30" height="30" viewBox="0 0 8 8" shapeRendering="crispEdges" style={{ flex: 'none' }}><g fill="#B42318"><rect x="3" y="0" width="2" height="1"></rect><rect x="2" y="1" width="4" height="1"></rect><rect x="1" y="2" width="6" height="3"></rect><rect x="0" y="5" width="8" height="1"></rect><rect x="3" y="6" width="2" height="1"></rect></g></svg></p>
            <p style={{ margin: '0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '14px', flexWrap: 'wrap' }}>Record it all, and generate reports of your whole operation<svg role="img" aria-label="report" width="26" height="30" viewBox="0 0 7 8" shapeRendering="crispEdges" style={{ flex: 'none' }}><g fill="currentColor"><rect x="0" y="0" width="5" height="1"></rect><rect x="0" y="1" width="1" height="7"></rect><rect x="1" y="7" width="6" height="1"></rect><rect x="6" y="2" width="1" height="5"></rect><rect x="5" y="1" width="1" height="1"></rect></g><g fill="#2F7D4F"><rect x="2" y="3" width="3" height="1"></rect><rect x="2" y="5" width="2" height="1"></rect></g></svg></p>
          </div>
          <ol style={{ listStyle: 'none', margin: '72px 0 0', padding: '0', width: '100%', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))', gap: '0', borderTop: '1px solid var(--l-line)', textAlign: 'left' }}>
            {steps.map((st, i2) => (<Fragment key={i2}>
              <li style={{ padding: '28px 24px 8px 0', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <span style={{ fontFamily: '\'Pixelify Sans\', monospace', fontSize: '28px', color: '#B93A07', lineHeight: '1' }}>{st.n}</span>
                <span style={{ fontSize: '17px', fontWeight: '600', letterSpacing: '-0.015em' }}>{st.title}</span>
                <span style={{ fontSize: '14px', lineHeight: '1.55', color: 'var(--l-muted)', maxWidth: '250px' }}>{st.body}</span>
              </li>
            </Fragment>))}
          </ol>
        </div>
        <div aria-hidden="true" style={{ display: 'grid', gridTemplateColumns: 'repeat(48, minmax(0, 1fr))', marginTop: '120px' }}>
          {dissolve.map((d, i) => (
            <div key={i} style={{ aspectRatio: '1', background: d.bg }}></div>
          ))}
        </div>
      </section>
      <section id="features" className="feature-scene" style={{ background: 'var(--l-alt)' }}>
        <div className="feature-stage">
          <div className="wrap feature-head" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '14px' }}>
            <p style={{ margin: '0', fontSize: '12px', fontWeight: '600', letterSpacing: '.08em', color: '#B93A07' }}>THE PRODUCT</p>
            <h2 style={{ margin: '0', fontWeight: '600', fontSize: 'clamp(30px, 3.4vw, 44px)', letterSpacing: '-0.035em', lineHeight: '1.08', maxWidth: '620px' }}>One place for the map, the day, the job and the proof.</h2>
          </div>
          <div className="wrap feature-grid">
            <div className={`feature-item ${featureState(0)}`}>
            <div className="feature-visual" style={{ position: 'relative', minHeight: '440px', overflow: 'hidden', background: 'linear-gradient(160deg, #F2B38F 0%, #DB4406 55%, #8A2A04 100%)' }}>
              <div aria-hidden="true" className="pixgrid-lite" style={{ position: 'absolute', inset: '0' }}></div>
              <div style={{ position: 'absolute', left: '50%', top: '-10px', transform: 'translateX(-50%)', width: '258px', height: '420px', borderRadius: '0 0 40px 40px', border: '7px solid #161616', borderTop: '0', background: '#4A4740', overflow: 'hidden', boxShadow: '0 30px 60px rgba(0,0,0,.3)' }}>
                <div aria-hidden="true" style={{ position: 'absolute', inset: '0', background: 'radial-gradient(40% 30% at 30% 30%, #9A927F 0%, transparent 70%), radial-gradient(40% 30% at 76% 50%, #7D786C 0%, transparent 70%), linear-gradient(180deg, #5C5850, #45423B)' }}></div>
                <div aria-hidden="true" className="pixgrid-lite" style={{ position: 'absolute', inset: '0' }}></div>
                <svg aria-hidden="true" width="244" height="420" viewBox="0 0 244 420" style={{ position: 'absolute', inset: '0' }}>
                  <polygon points="20,70 220,58 226,250 28,262" fill="rgba(219,68,6,.08)" stroke="#FF6A2B" strokeWidth="2" strokeDasharray="7 5"></polygon>
                  <polygon points="40,90 130,86 134,170 44,176" fill="rgba(47,125,79,.32)" stroke="#5FBF86" strokeWidth="1.5"></polygon>
                  <polygon points="150,150 210,146 212,232 154,236" fill="rgba(154,107,0,.32)" stroke="#E2B44A" strokeWidth="1.5"></polygon>
                </svg>
                <div style={{ position: 'absolute', left: '46px', top: '94px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(0,0,0,.55)', color: '#fff', fontSize: '8.5px', fontWeight: '600' }}>Tower A</div>
                <div style={{ position: 'absolute', left: '152px', top: '154px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(0,0,0,.55)', color: '#fff', fontSize: '8.5px', fontWeight: '600' }}>Yard</div>
                <div aria-hidden="true" style={{ position: 'absolute', left: '70px', top: '122px', width: '22px', height: '22px', borderRadius: '50%', background: '#1A1A1A', border: '2px solid #5FBF86', color: '#fff', fontSize: '8px', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>FA</div>
                <div aria-hidden="true" style={{ position: 'absolute', left: '100px', top: '140px', width: '22px', height: '22px', borderRadius: '50%', background: '#1A1A1A', border: '2px solid #5FBF86', color: '#fff', fontSize: '8px', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>MS</div>
                <div aria-hidden="true" style={{ position: 'absolute', left: '170px', top: '188px', width: '22px', height: '22px', borderRadius: '50%', background: '#1A1A1A', border: '2px solid #5FBF86', color: '#fff', fontSize: '8px', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>YK</div>
                <div aria-hidden="true" style={{ position: 'absolute', left: '196px', top: '268px', width: '22px', height: '22px', borderRadius: '50%', background: '#B42318', border: '2px solid #fff', color: '#fff', fontSize: '8px', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 0 5px rgba(180,35,24,.35)' }}>OK</div>
                <div className="glass" style={{ position: 'absolute', left: '12px', top: '14px', display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '5px 10px', borderRadius: '999px', background: 'rgba(255,255,255,.92)', fontSize: '10px', fontWeight: '600' }}>
                  <span aria-hidden="true" style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#2F7D4F' }}></span>Live · 18 on site
                </div>
                <div style={{ position: 'absolute', left: '10px', right: '10px', bottom: '26px', padding: '10px 12px', borderRadius: '14px', background: '#fff', fontSize: '10px', boxShadow: '0 8px 24px rgba(0,0,0,.25)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '600', marginBottom: '8px' }}><span>Team</span><span style={{ color: 'var(--l-muted)', fontWeight: '500' }}>18 live</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderTop: '1px solid var(--l-line2)' }}><span>Omar K.</span><span style={{ color: '#B42318', fontWeight: '600' }}>Left zone · 2 min</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderTop: '1px solid var(--l-line2)' }}><span>Faisal A.</span><span style={{ color: 'var(--l-muted)' }}>Tower A · 3h 12m</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderTop: '1px solid var(--l-line2)' }}><span>Yousef K.</span><span style={{ color: 'var(--l-muted)' }}>Yard · 1h 40m</span></div>
                </div>
                <div aria-hidden="true" style={{ position: 'absolute', left: '50%', bottom: '9px', width: '92px', height: '4px', borderRadius: '4px', background: '#fff', transform: 'translateX(-50%)' }}></div>
              </div>
            </div>
            <div className="feature-text" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '40px', padding: '24px 0' }}>
              <div>
                <p style={{ margin: '0 0 14px', fontFamily: '\'Geist Mono\', monospace', fontSize: '12px', color: 'var(--l-muted)' }}>01 / LIVE MAP</p>
                <h3 style={{ margin: '0', fontWeight: '600', fontSize: 'clamp(28px, 2.6vw, 36px)', lineHeight: '1.1', letterSpacing: '-0.035em' }}>Every worker.<br />Live on the map.</h3>
                <p style={{ margin: '18px 0 0', fontSize: '15px', color: 'var(--l-body)' }}>See who is on site, and in which zone, right now.</p>
              </div>
              <div>
                <p style={{ margin: '0', maxWidth: '320px', fontSize: '15px', lineHeight: '1.55', color: 'var(--l-body)' }}>Draw your site and its zones on the satellite map. When someone walks out of their zone, they turn red on the map and an alert opens. Search the map for any worker or zone, and keep the roster open beside it.</p>
              </div>
            </div>
            </div>
            <div className={`feature-item ${featureState(1)}`}>
            <div className="feature-visual" style={{ position: 'relative', minHeight: '440px', overflow: 'hidden', background: 'linear-gradient(180deg, #CFE8D8 0%, #7DBB94 50%, #2F7D4F 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', boxSizing: 'border-box' }}>
              <div aria-hidden="true" className="pixgrid-lite" style={{ position: 'absolute', inset: '0' }}></div>
              <div style={{ position: 'relative', width: '100%', maxWidth: '330px', padding: '18px', borderRadius: '16px', background: '#fff', boxShadow: '0 24px 50px rgba(0,0,0,.2)', fontSize: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span aria-hidden="true" style={{ width: '34px', height: '34px', borderRadius: '50%', background: '#1A1A1A', color: '#fff', fontSize: '11px', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>FA</span>
                  <div>
                    <div style={{ fontWeight: '600', fontSize: '13px' }}>Faisal Al-Harbi</div>
                    <div style={{ color: 'var(--l-muted)' }}>Steel fixer · Tuesday 17 November</div>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px', marginTop: '14px' }}>
                  <div style={{ padding: '9px 10px', borderRadius: '10px', background: 'var(--l-alt)' }}><div style={{ color: 'var(--l-muted)', fontSize: '10.5px' }}>First in</div><div style={{ fontWeight: '600', fontSize: '15px', marginTop: '2px' }}>06:58</div></div>
                  <div style={{ padding: '9px 10px', borderRadius: '10px', background: 'var(--l-alt)' }}><div style={{ color: 'var(--l-muted)', fontSize: '10.5px' }}>Last out</div><div style={{ fontWeight: '600', fontSize: '15px', marginTop: '2px' }}>15:42</div></div>
                  <div style={{ padding: '9px 10px', borderRadius: '10px', background: 'var(--l-alt)' }}><div style={{ color: 'var(--l-muted)', fontSize: '10.5px' }}>Worked</div><div style={{ fontWeight: '600', fontSize: '15px', marginTop: '2px' }}>8h 21m</div></div>
                  <div style={{ padding: '9px 10px', borderRadius: '10px', background: '#FBE6E4' }}><div style={{ color: '#B42318', fontSize: '10.5px' }}>Alerts</div><div style={{ fontWeight: '600', fontSize: '15px', marginTop: '2px', color: '#B42318' }}>1</div></div>
                </div>
                <div style={{ marginTop: '14px', fontWeight: '600' }}>Time per zone</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                  <div><div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Tower A</span><span style={{ color: 'var(--l-muted)' }}>5h 40m</span></div><div style={{ height: '6px', borderRadius: '3px', background: 'var(--l-stamp)', marginTop: '4px' }}><div style={{ width: '68%', height: '6px', borderRadius: '3px', background: '#DB4406' }}></div></div></div>
                  <div><div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Laydown yard</span><span style={{ color: 'var(--l-muted)' }}>1h 55m</span></div><div style={{ height: '6px', borderRadius: '3px', background: 'var(--l-stamp)', marginTop: '4px' }}><div style={{ width: '23%', height: '6px', borderRadius: '3px', background: '#DB4406' }}></div></div></div>
                  <div><div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Site office</span><span style={{ color: 'var(--l-muted)' }}>46m</span></div><div style={{ height: '6px', borderRadius: '3px', background: 'var(--l-stamp)', marginTop: '4px' }}><div style={{ width: '9%', height: '6px', borderRadius: '3px', background: '#DB4406' }}></div></div></div>
                </div>
              </div>
            </div>
            <div className="feature-text" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '40px', padding: '24px 0' }}>
              <div>
                <p style={{ margin: '0 0 14px', fontFamily: '\'Geist Mono\', monospace', fontSize: '12px', color: 'var(--l-muted)' }}>02 / HISTORY</p>
                <h3 style={{ margin: '0', fontWeight: '600', fontSize: 'clamp(28px, 2.6vw, 36px)', lineHeight: '1.1', letterSpacing: '-0.035em' }}>Every day.<br />On the record.</h3>
                <p style={{ margin: '18px 0 0', fontSize: '15px', color: 'var(--l-body)' }}>Attendance and hours taken from the work itself.</p>
              </div>
              <div>
                <p style={{ margin: '0', maxWidth: '330px', fontSize: '15px', lineHeight: '1.55', color: 'var(--l-body)' }}>Each worker's day shows first in and last out, time in every zone, alerts and any correction. Replay their path minute by minute.</p>
              </div>
            </div>
            </div>
            <div className={`feature-item ${featureState(2)}`}>
            <div className="feature-visual" style={{ position: 'relative', minHeight: '440px', overflow: 'hidden', background: 'linear-gradient(160deg, #E0F0F5 0%, #7FB4C6 50%, #15607A 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', boxSizing: 'border-box' }}>
              <div aria-hidden="true" className="pixgrid-lite" style={{ position: 'absolute', inset: '0' }}></div>
              <div style={{ position: 'relative', width: '100%', maxWidth: '340px', padding: '18px', borderRadius: '16px', background: '#fff', boxShadow: '0 24px 50px rgba(0,0,0,.2)', fontSize: '12px' }}>
                <div style={{ fontWeight: '600', fontSize: '13px' }}>Check a report</div>
                <div style={{ marginTop: '12px', padding: '16px', borderRadius: '12px', border: '1.5px dashed #D4D2CF', background: '#FAFAF9', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <svg aria-hidden="true" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#B93A07" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"></path><path d="M14 3v5h5"></path><path d="M9 13h6"></path><path d="M9 17h4"></path></svg>
                  <div style={{ minWidth: '0' }}>
                    <div style={{ fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>SITE14-R-0412-Tower-A.pdf</div>
                    <div style={{ color: 'var(--l-muted)', fontSize: '11px' }}>Weekly · 9 – 15 Nov 2026</div>
                  </div>
                </div>
                <div style={{ marginTop: '12px', padding: '12px', borderRadius: '12px', background: '#E8F3EC', display: 'flex', gap: '10px' }}>
                  <span aria-hidden="true" style={{ width: '24px', height: '24px', flex: 'none', borderRadius: '50%', background: '#2F7D4F', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5 9-10"></path></svg>
                  </span>
                  <div>
                    <div style={{ fontWeight: '600', color: '#2F7D4F' }}>Genuine and unchanged</div>
                    <div style={{ color: '#3E5E4A', marginTop: '2px' }}>Matches the report issued 16 Nov 2026, 18:04</div>
                  </div>
                </div>
                <div style={{ marginTop: '12px', fontFamily: '\'Geist Mono\', monospace', fontSize: '10.5px', color: 'var(--l-muted)', wordBreak: 'break-all' }}>SHA-256 · 9f2c7a1e…b81d41ab</div>
              </div>
            </div>
            <div className="feature-text" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '40px', padding: '24px 0' }}>
              <div>
                <p style={{ margin: '0 0 14px', fontFamily: '\'Geist Mono\', monospace', fontSize: '12px', color: 'var(--l-muted)' }}>03 / REPORTS</p>
                <h3 style={{ margin: '0', fontWeight: '600', fontSize: 'clamp(28px, 2.6vw, 36px)', lineHeight: '1.1', letterSpacing: '-0.035em' }}>Reports nobody<br />can quietly edit.</h3>
                <p style={{ margin: '18px 0 0', fontSize: '15px', color: 'var(--l-body)' }}>Daily, weekly and monthly PDFs for every site.</p>
              </div>
              <div>
                <p style={{ margin: '0', maxWidth: '320px', fontSize: '15px', lineHeight: '1.55', color: 'var(--l-body)' }}>Every report carries a fingerprint. Drop the PDF back in and SITE14 tells you whether a single byte has changed.</p>
              </div>
            </div>
            </div>
            <div className={`feature-item ${featureState(3)}`}>
            <div className="feature-visual" style={{ position: 'relative', minHeight: '440px', overflow: 'hidden', background: 'linear-gradient(160deg, #F7EBC8 0%, #E2B44A 50%, #9A6B00 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', boxSizing: 'border-box' }}>
              <div aria-hidden="true" className="pixgrid-lite" style={{ position: 'absolute', inset: '0' }}></div>
              <div style={{ position: 'relative', width: '100%', maxWidth: '340px', padding: '18px', borderRadius: '16px', background: '#fff', boxShadow: '0 24px 50px rgba(0,0,0,.2)', fontSize: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontWeight: '600', fontSize: '13px' }}>Tasks · Tower A</span>
                  <span style={{ color: 'var(--l-muted)' }}>Tue 17 Nov</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', marginTop: '10px' }}>
                  {tasks.map((tk, i6) => (<Fragment key={i6}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', padding: '10px 0', borderTop: '1px solid var(--l-line2)' }}>
                      <div style={{ minWidth: '0' }}>
                        <div style={{ fontWeight: '500' }}>{tk.title}</div>
                        <div style={{ color: 'var(--l-muted)', fontSize: '11px', marginTop: '2px' }}>{tk.who}</div>
                      </div>
                      <span style={{ flex: 'none', padding: '3px 8px', borderRadius: '999px', fontSize: '10.5px', fontWeight: '600', background: tk.bg, color: tk.fg }}>{tk.status}</span>
                    </div>
                  </Fragment>))}
                </div>
              </div>
            </div>
            <div className="feature-text" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '40px', padding: '24px 0' }}>
              <div>
                <p style={{ margin: '0 0 14px', fontFamily: '\'Geist Mono\', monospace', fontSize: '12px', color: 'var(--l-muted)' }}>04 / TASKS</p>
                <h3 style={{ margin: '0', fontWeight: '600', fontSize: 'clamp(28px, 2.6vw, 36px)', lineHeight: '1.1', letterSpacing: '-0.035em' }}>Every worker.<br />Today's job.</h3>
                <p style={{ margin: '18px 0 0', fontSize: '15px', color: 'var(--l-body)' }}>Plan the day per person, per site.</p>
              </div>
              <div>
                <p style={{ margin: '0', maxWidth: '330px', fontSize: '15px', lineHeight: '1.55', color: 'var(--l-body)' }}>Give a worker a task for a day and a site, then follow it from To do to In progress to Done. Filter by site, person or status to see what is still open.</p>
              </div>
            </div>
            </div>
          </div>
          <div className="wrap feature-progress" aria-hidden="true">
            {[0, 1, 2, 3].map((n) => (
              <span key={n} className={n === active ? "is-on" : undefined}>{`0${n + 1}`}</span>
            ))}
          </div>
        </div>
      </section>
      <section id="devices" style={{ background: 'var(--l-bg)', padding: '120px 0' }}>
        <div className="wrap" data-reveal style={{ display: 'flex', flexDirection: 'column', gap: '64px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '14px' }}>
            <p style={{ margin: '0', fontSize: '12px', fontWeight: '600', letterSpacing: '.08em', color: '#B93A07' }}>DEVICES</p>
            <h2 style={{ margin: '0', fontWeight: '600', fontSize: 'clamp(30px, 3.4vw, 44px)', letterSpacing: '-0.035em', lineHeight: '1.08', maxWidth: '640px' }}>Start with the phones they already carry.</h2>
            <p style={{ margin: '8px 0 0', maxWidth: '460px', fontSize: '15px', lineHeight: '1.5', color: 'var(--l-muted)' }}>Three ways to get a device on the map. Mix them on the same site.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))', gap: '20px' }}>
            <div style={{ border: '1px solid var(--l-line)', padding: '28px', display: 'flex', flexDirection: 'column', gap: '22px' }}>
              <div className="dots" style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '20px' }}>
                <div role="img" aria-label="QR code for pairing a device" style={{ padding: '8px', background: '#fff', display: 'grid', gridTemplateColumns: 'repeat(21, 5px)', gridAutoRows: '5px', boxShadow: '0 10px 24px rgba(0,0,0,.08)' }}>
                  {qr.map((q, i9) => (<Fragment key={i9}>
                    <div style={{ background: q.bg }}></div>
                  </Fragment>))}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', textAlign: 'left' }}>
                  <span style={{ fontSize: '11px', color: 'var(--l-muted)' }}>Pairing code</span>
                  <span style={{ fontFamily: '\'Geist Mono\', monospace', fontSize: '18px', fontWeight: '500', letterSpacing: '.08em' }}>K7Q-42M</span>
                </div>
              </div>
              <div>
                <h3 style={{ margin: '0', fontSize: '20px', fontWeight: '600', letterSpacing: '-0.02em' }}>Connect from the browser</h3>
                <p style={{ margin: '10px 0 0', fontSize: '14px', lineHeight: '1.55', color: 'var(--l-body)' }}>Show a QR code. The worker scans it and their phone, tablet, laptop or watch starts sending its location. Nothing to install from an app store.</p>
              </div>
            </div>
            <div style={{ border: '1px solid var(--l-line)', padding: '28px', display: 'flex', flexDirection: 'column', gap: '22px' }}>
              <div className="dots" style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 20px', boxSizing: 'border-box' }}>
                <div style={{ width: '100%', maxWidth: '260px', background: '#fff', borderRadius: '12px', padding: '12px 14px', boxShadow: '0 10px 24px rgba(0,0,0,.08)', fontSize: '11.5px', boxSizing: 'border-box' }}>
                  <div style={{ fontWeight: '600', marginBottom: '6px' }}>Register by serial</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: '1px solid var(--l-line2)', fontFamily: '\'Geist Mono\', monospace' }}><span>TRK-0418</span><span style={{ color: '#2F7D4F' }}>Added</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: '1px solid var(--l-line2)', fontFamily: '\'Geist Mono\', monospace' }}><span>TRK-0419</span><span style={{ color: '#2F7D4F' }}>Added</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: '1px solid var(--l-line2)', fontFamily: '\'Geist Mono\', monospace' }}><span>TRK-0420</span><span style={{ color: '#2F7D4F' }}>Added</span></div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px', color: '#B93A07', fontWeight: '600' }}>
                    <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12"></path><path d="m7 10 5 5 5-5"></path><path d="M5 21h14"></path></svg>
                    Download keys (.csv)
                  </div>
                </div>
              </div>
              <div>
                <h3 style={{ margin: '0', fontSize: '20px', fontWeight: '600', letterSpacing: '-0.02em' }}>Register by serial</h3>
                <p style={{ margin: '10px 0 0', fontSize: '14px', lineHeight: '1.55', color: 'var(--l-body)' }}>Already own GPS trackers? Add them by serial number and download their device keys in one file.</p>
              </div>
            </div>
            <div style={{ border: '1px solid var(--l-line)', padding: '28px', display: 'flex', flexDirection: 'column', gap: '22px' }}>
              <div className="dots" style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div role="img" aria-label="Pixel smartwatch" style={{ display: 'grid', gridTemplateColumns: 'repeat(14, 7px)', gridAutoRows: '7px', gap: '1px' }}>
                  {watchCells.map((c, i10) => (<Fragment key={i10}>
                    <div style={{ background: c.bg }}></div>
                  </Fragment>))}
                </div>
              </div>
              <div>
                <h3 style={{ margin: '0', fontSize: '20px', fontWeight: '600', letterSpacing: '-0.02em' }}>Buy from SITE14</h3>
                <p style={{ margin: '10px 0 0', fontSize: '14px', lineHeight: '1.55', color: 'var(--l-body)' }}>Order ready-to-go devices from the marketplace. They arrive set up for your company and connect on first power-on.</p>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="after-panels" id="faq" style={{ background: 'var(--l-bg)', padding: '120px 0' }}>
        <div className="wrap" data-reveal style={{ maxWidth: '1060px', display: 'flex', flexWrap: 'wrap', gap: '56px' }}>
          <div style={{ flex: '1 1 280px' }}>
            <p style={{ margin: '0', fontSize: '12px', fontWeight: '600', letterSpacing: '.08em', color: '#B93A07' }}>FAQ</p>
            <h2 style={{ margin: '14px 0 0', fontWeight: '600', fontSize: 'clamp(30px, 3.4vw, 44px)', letterSpacing: '-0.035em', lineHeight: '1.08' }}>Questions from the site office.</h2>
            <p style={{ margin: '18px 0 0', maxWidth: '300px', fontSize: '15px', lineHeight: '1.55', color: 'var(--l-muted)' }}>Something else? Create an account and try it on your own site.</p>
          </div>
          <div className="faq" style={{ flex: '999 1 520px', minWidth: '0', display: 'flex', flexDirection: 'column', borderTop: '1px solid var(--l-line)' }}>
            {faq.map((fq, i15) => (<Fragment key={i15}>
              <details style={{ borderBottom: '1px solid var(--l-line)' }}>
                <summary style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', minHeight: '64px', padding: '16px 0', boxSizing: 'border-box', fontSize: '16px', fontWeight: '600', letterSpacing: '-0.01em' }}>
                  {fq.q}
                  <svg className="plus" aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flex: 'none' }}><path d="M12 5v14"></path><path d="M5 12h14"></path></svg>
                </summary>
                <p style={{ margin: '0', padding: '0 40px 22px 0', fontSize: '15px', lineHeight: '1.6', color: 'var(--l-body)' }}>{fq.a}</p>
              </details>
            </Fragment>))}
          </div>
        </div>
      </section>
      <section className="band after-panels" style={{ position: 'relative', overflow: 'hidden', background: '#1A1A1A', padding: '120px 0' }}>
        <div aria-hidden="true" style={{ position: 'absolute', inset: '0', background: 'radial-gradient(40% 70% at 50% 120%, rgba(219,68,6,.45) 0%, transparent 70%)' }}></div>
        <div className="wrap" data-reveal style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <h2 style={{ margin: '0', fontWeight: '600', fontSize: 'clamp(30px, 3.6vw, 48px)', letterSpacing: '-0.035em', lineHeight: '1.08', color: '#fff', maxWidth: '680px' }}>Put your site <span style={{ fontFamily: '\'Pixelify Sans\', monospace', fontWeight: '500', color: accent }}>on the map</span> today.</h2>
          <p style={{ margin: '20px 0 0', maxWidth: '460px', fontSize: '15px', lineHeight: '1.55', color: 'rgba(255,255,255,.78)' }}>Pair a phone or watch with a QR code, or order ready-to-go devices from the marketplace. They connect on first power-on.</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '8px', marginTop: '32px' }}>
            <Link to="/signin" className="l-btn l-btn-primary">Create your company account</Link>
            <a href="#devices" className="l-btn l-btn-secondary">Browse devices</a>
          </div>
        </div>
      </section>
      <footer className="after-panels" style={{ background: '#141414', color: 'rgba(255,255,255,.7)', padding: '72px 0 36px', borderTop: '1px solid rgba(255,255,255,.08)' }}>
        <div className="wrap" data-reveal style={{ display: 'flex', flexDirection: 'column', gap: '56px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '48px', justifyContent: 'space-between' }}>
            <div style={{ flex: '1 1 260px', maxWidth: '320px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <span style={{ fontSize: '22px', fontWeight: '700', letterSpacing: '-0.02em', color: '#fff' }}>SITE<span style={{ color: accent }}>14</span></span>
              <p style={{ margin: '0', fontSize: '13.5px', lineHeight: '1.55' }}>Live attendance, zones and hours for construction sites, recorded as the work happens.</p>
            </div>
            <div style={{ flex: '2 1 480px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '32px', fontSize: '13.5px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <span style={{ fontSize: '12px', fontWeight: '600', letterSpacing: '.06em', color: '#fff' }}>PRODUCT</span>
                <a href="#features">Live map</a>
                <a href="#features">History</a>
                <a href="#features">Reports</a>
                <a href="#features">Tasks</a>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <span style={{ fontSize: '12px', fontWeight: '600', letterSpacing: '.06em', color: '#fff' }}>DEVICES</span>
                <a href="#devices">Connect a device</a>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <span style={{ fontSize: '12px', fontWeight: '600', letterSpacing: '.06em', color: '#fff' }}>ACCOUNT</span>
                <Link to="/signin">Sign in</Link>
                <Link to="/signin">Sign up</Link>
                <a href="#faq">FAQ</a>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '16px', paddingTop: '24px', borderTop: '1px solid rgba(255,255,255,.08)', fontSize: '12.5px' }}>
            <span>© 2026 SITE14</span>
            <span>Riyadh, Saudi Arabia</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
