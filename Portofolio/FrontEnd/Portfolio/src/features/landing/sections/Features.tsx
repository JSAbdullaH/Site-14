import { tasks } from "../landingData";
import { useFeatureScene } from "../hooks/useFeatureScene";

export function Features() {
  const { sceneRef, active, featureState } = useFeatureScene();
  return (
    <section ref={sceneRef} id="features" className="feature-scene bg-(--l-alt)">
      <div className="feature-stage">
        <div className="wrap feature-head flex flex-col items-center text-center gap-3.5">
          <p className="text-[12px] font-semibold tracking-[.08em] text-[#B93A07]">THE PRODUCT</p>
          <h2 className="font-semibold text-[clamp(30px,_3.4vw,_44px)] tracking-[-0.035em] leading-[1.08] max-w-[620px]">One place for the map, the day, the job and the proof.</h2>
        </div>
        <div className="wrap feature-grid">
          <div className={`feature-item ${featureState(0)}`}>
          <div className="feature-visual relative min-h-[440px] overflow-hidden bg-[linear-gradient(160deg,_#F2B38F_0%,_#DB4406_55%,_#8A2A04_100%)]">
            <div aria-hidden="true" className="pixgrid-lite absolute inset-0"></div>
            <div className="absolute left-1/2 -top-2.5 -translate-x-1/2 w-[258px] h-[420px] rounded-b-[40px] border-[7px] border-[#161616] border-t-0 bg-[#4A4740] overflow-hidden shadow-[0_30px_60px_rgba(0,0,0,.3)]">
              <div aria-hidden="true" className="absolute inset-0" style={{ background: 'radial-gradient(40% 30% at 30% 30%, #9A927F 0%, transparent 70%), radial-gradient(40% 30% at 76% 50%, #7D786C 0%, transparent 70%), linear-gradient(180deg, #5C5850, #45423B)' }}></div>
              <div aria-hidden="true" className="pixgrid-lite absolute inset-0"></div>
              <svg aria-hidden="true" width="244" height="420" viewBox="0 0 244 420" className="absolute inset-0">
                <polygon points="20,70 220,58 226,250 28,262" fill="rgba(219,68,6,.08)" stroke="#FF6A2B" strokeWidth="2" strokeDasharray="7 5"></polygon>
                <polygon points="40,90 130,86 134,170 44,176" fill="rgba(47,125,79,.32)" stroke="#5FBF86" strokeWidth="1.5"></polygon>
                <polygon points="150,150 210,146 212,232 154,236" fill="rgba(154,107,0,.32)" stroke="#E2B44A" strokeWidth="1.5"></polygon>
              </svg>
              <div className="absolute left-11.5 top-23.5 py-0.5 px-1.5 rounded-[4px] bg-[rgba(0,0,0,.55)] text-[#fff] text-[8.5px] font-semibold">Tower A</div>
              <div className="absolute left-38 top-38.5 py-0.5 px-1.5 rounded-[4px] bg-[rgba(0,0,0,.55)] text-[#fff] text-[8.5px] font-semibold">Yard</div>
              <div aria-hidden="true" className="absolute left-17.5 top-30.5 w-[22px] h-[22px] rounded-full bg-[#1A1A1A] border-2 border-[#5FBF86] text-[#fff] text-[8px] font-bold flex items-center justify-center">FA</div>
              <div aria-hidden="true" className="absolute left-25 top-35 w-[22px] h-[22px] rounded-full bg-[#1A1A1A] border-2 border-[#5FBF86] text-[#fff] text-[8px] font-bold flex items-center justify-center">MS</div>
              <div aria-hidden="true" className="absolute left-42.5 top-47 w-[22px] h-[22px] rounded-full bg-[#1A1A1A] border-2 border-[#5FBF86] text-[#fff] text-[8px] font-bold flex items-center justify-center">YK</div>
              <div aria-hidden="true" className="absolute left-49 top-67 w-[22px] h-[22px] rounded-full bg-[#B42318] border-2 border-[#fff] text-[#fff] text-[8px] font-bold flex items-center justify-center shadow-[0_0_0_5px_rgba(180,35,24,.35)]">OK</div>
              <div className="glass absolute left-3 top-3.5 inline-flex items-center gap-1.5 py-[5px] px-2.5 rounded-full bg-[rgba(255,255,255,.92)] text-[10px] font-semibold">
                <span aria-hidden="true" className="w-[6px] h-[6px] rounded-full bg-[#2F7D4F]"></span>Live · 18 on site
              </div>
              <div className="absolute left-2.5 right-2.5 bottom-6.5 py-2.5 px-3 rounded-[14px] bg-[#fff] text-[10px] shadow-[0_8px_24px_rgba(0,0,0,.25)]">
                <div className="flex justify-between font-semibold mb-2"><span>Team</span><span className="text-(--l-muted) font-medium">18 live</span></div>
                <div className="flex justify-between py-1 border-t border-t-(--l-line2)"><span>Omar K.</span><span className="text-[#B42318] font-semibold">Left zone · 2 min</span></div>
                <div className="flex justify-between py-1 border-t border-t-(--l-line2)"><span>Faisal A.</span><span className="text-(--l-muted)">Tower A · 3h 12m</span></div>
                <div className="flex justify-between py-1 border-t border-t-(--l-line2)"><span>Yousef K.</span><span className="text-(--l-muted)">Yard · 1h 40m</span></div>
              </div>
              <div aria-hidden="true" className="absolute left-1/2 bottom-[9px] w-[92px] h-[4px] rounded-[4px] bg-[#fff] -translate-x-1/2"></div>
            </div>
          </div>
          <div className="feature-text flex flex-col justify-between gap-10 py-6">
            <div>
              <p className="mb-3.5 font-[Geist_Mono,monospace] text-[12px] text-(--l-muted)">01 / LIVE MAP</p>
              <h3 className="font-semibold text-[clamp(28px,_2.6vw,_36px)] leading-[1.1] tracking-[-0.035em]">Every worker.<br />Live on the map.</h3>
              <p className="mt-4.5 text-[15px] text-(--l-body)">See who is on site, and in which zone, right now.</p>
            </div>
            <div>
              <p className="max-w-[320px] text-[15px] leading-[1.55] text-(--l-body)">Draw your site and its zones on the satellite map. When someone walks out of their zone, they turn red on the map and an alert opens. Search the map for any worker or zone, and keep the roster open beside it.</p>
            </div>
          </div>
          </div>
          <div className={`feature-item ${featureState(1)}`}>
          <div className="feature-visual relative min-h-[440px] overflow-hidden bg-[linear-gradient(180deg,_#CFE8D8_0%,_#7DBB94_50%,_#2F7D4F_100%)] flex items-center justify-center py-10 px-6 box-border">
            <div aria-hidden="true" className="pixgrid-lite absolute inset-0"></div>
            <div className="relative w-full max-w-[330px] p-4.5 rounded-[16px] bg-[#fff] shadow-[0_24px_50px_rgba(0,0,0,.2)] text-[12px]">
              <div className="flex items-center gap-2.5">
                <span aria-hidden="true" className="w-[34px] h-[34px] rounded-full bg-[#1A1A1A] text-[#fff] text-[11px] font-bold flex items-center justify-center">FA</span>
                <div>
                  <div className="font-semibold text-[13px]">Faisal Al-Harbi</div>
                  <div className="text-(--l-muted)">Steel fixer · Tuesday 17 November</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-3.5">
                <div className="py-[9px] px-2.5 rounded-[10px] bg-(--l-alt)"><div className="text-(--l-muted) text-[10.5px]">First in</div><div className="font-semibold text-[15px] mt-0.5">06:58</div></div>
                <div className="py-[9px] px-2.5 rounded-[10px] bg-(--l-alt)"><div className="text-(--l-muted) text-[10.5px]">Last out</div><div className="font-semibold text-[15px] mt-0.5">15:42</div></div>
                <div className="py-[9px] px-2.5 rounded-[10px] bg-(--l-alt)"><div className="text-(--l-muted) text-[10.5px]">Worked</div><div className="font-semibold text-[15px] mt-0.5">8h 21m</div></div>
                <div className="py-[9px] px-2.5 rounded-[10px] bg-[#FBE6E4]"><div className="text-[#B42318] text-[10.5px]">Alerts</div><div className="font-semibold text-[15px] mt-0.5 text-[#B42318]">1</div></div>
              </div>
              <div className="mt-3.5 font-semibold">Time per zone</div>
              <div className="flex flex-col gap-2 mt-2">
                <div><div className="flex justify-between"><span>Tower A</span><span className="text-(--l-muted)">5h 40m</span></div><div className="h-[6px] rounded-[3px] bg-(--l-stamp) mt-1"><div className="w-[68%] h-[6px] rounded-[3px] bg-[#DB4406]"></div></div></div>
                <div><div className="flex justify-between"><span>Laydown yard</span><span className="text-(--l-muted)">1h 55m</span></div><div className="h-[6px] rounded-[3px] bg-(--l-stamp) mt-1"><div className="w-[23%] h-[6px] rounded-[3px] bg-[#DB4406]"></div></div></div>
                <div><div className="flex justify-between"><span>Site office</span><span className="text-(--l-muted)">46m</span></div><div className="h-[6px] rounded-[3px] bg-(--l-stamp) mt-1"><div className="w-[9%] h-[6px] rounded-[3px] bg-[#DB4406]"></div></div></div>
              </div>
            </div>
          </div>
          <div className="feature-text flex flex-col justify-between gap-10 py-6">
            <div>
              <p className="mb-3.5 font-[Geist_Mono,monospace] text-[12px] text-(--l-muted)">02 / HISTORY</p>
              <h3 className="font-semibold text-[clamp(28px,_2.6vw,_36px)] leading-[1.1] tracking-[-0.035em]">Every day.<br />On the record.</h3>
              <p className="mt-4.5 text-[15px] text-(--l-body)">Attendance and hours taken from the work itself.</p>
            </div>
            <div>
              <p className="max-w-[330px] text-[15px] leading-[1.55] text-(--l-body)">Each worker's day shows first in and last out, time in every zone, alerts and any correction. Replay their path minute by minute.</p>
            </div>
          </div>
          </div>
          <div className={`feature-item ${featureState(2)}`}>
          <div className="feature-visual relative min-h-[440px] overflow-hidden bg-[linear-gradient(160deg,_#E0F0F5_0%,_#7FB4C6_50%,_#15607A_100%)] flex items-center justify-center py-10 px-6 box-border">
            <div aria-hidden="true" className="pixgrid-lite absolute inset-0"></div>
            <div className="relative w-full max-w-[340px] p-4.5 rounded-[16px] bg-[#fff] shadow-[0_24px_50px_rgba(0,0,0,.2)] text-[12px]">
              <div className="font-semibold text-[13px]">Check a report</div>
              <div className="mt-3 p-4 rounded-[12px] border-[1.5px] border-dashed border-[#D4D2CF] bg-[#FAFAF9] flex items-center gap-2.5">
                <svg aria-hidden="true" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#B93A07" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"></path><path d="M14 3v5h5"></path><path d="M9 13h6"></path><path d="M9 17h4"></path></svg>
                <div className="min-w-0">
                  <div className="font-medium overflow-hidden text-ellipsis whitespace-nowrap">SITE14-R-0412-Tower-A.pdf</div>
                  <div className="text-(--l-muted) text-[11px]">Weekly · 9 – 15 Nov 2026</div>
                </div>
              </div>
              <div className="mt-3 p-3 rounded-[12px] bg-[#E8F3EC] flex gap-2.5">
                <span aria-hidden="true" className="w-[24px] h-[24px] flex-none rounded-full bg-[#2F7D4F] text-[#fff] flex items-center justify-center">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5 9-10"></path></svg>
                </span>
                <div>
                  <div className="font-semibold text-[#2F7D4F]">Genuine and unchanged</div>
                  <div className="text-[#3E5E4A] mt-0.5">Matches the report issued 16 Nov 2026, 18:04</div>
                </div>
              </div>
              <div className="mt-3 font-[Geist_Mono,monospace] text-[10.5px] text-(--l-muted) break-all">SHA-256 · 9f2c7a1e…b81d41ab</div>
            </div>
          </div>
          <div className="feature-text flex flex-col justify-between gap-10 py-6">
            <div>
              <p className="mb-3.5 font-[Geist_Mono,monospace] text-[12px] text-(--l-muted)">03 / REPORTS</p>
              <h3 className="font-semibold text-[clamp(28px,_2.6vw,_36px)] leading-[1.1] tracking-[-0.035em]">Reports nobody<br />can quietly edit.</h3>
              <p className="mt-4.5 text-[15px] text-(--l-body)">Daily, weekly and monthly PDFs for every site.</p>
            </div>
            <div>
              <p className="max-w-[320px] text-[15px] leading-[1.55] text-(--l-body)">Every report carries a fingerprint. Drop the PDF back in and SITE14 tells you whether a single byte has changed.</p>
            </div>
          </div>
          </div>
          <div className={`feature-item ${featureState(3)}`}>
          <div className="feature-visual relative min-h-[440px] overflow-hidden bg-[linear-gradient(160deg,_#F7EBC8_0%,_#E2B44A_50%,_#9A6B00_100%)] flex items-center justify-center py-10 px-6 box-border">
            <div aria-hidden="true" className="pixgrid-lite absolute inset-0"></div>
            <div className="relative w-full max-w-[340px] p-4.5 rounded-[16px] bg-[#fff] shadow-[0_24px_50px_rgba(0,0,0,.2)] text-[12px]">
              <div className="flex justify-between items-baseline">
                <span className="font-semibold text-[13px]">Tasks · Tower A</span>
                <span className="text-(--l-muted)">Tue 17 Nov</span>
              </div>
              <div className="flex flex-col mt-2.5">
                {tasks.map((tk) => (
                  <div key={tk.title} className="flex items-center justify-between gap-2.5 py-2.5 border-t border-t-(--l-line2)">
                    <div className="min-w-0">
                      <div className="font-medium">{tk.title}</div>
                      <div className="text-(--l-muted) text-[11px] mt-0.5">{tk.who}</div>
                    </div>
                    <span className="flex-none py-[3px] px-2 rounded-full text-[10.5px] font-semibold" style={{ background: tk.bg, color: tk.fg }}>{tk.status}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="feature-text flex flex-col justify-between gap-10 py-6">
            <div>
              <p className="mb-3.5 font-[Geist_Mono,monospace] text-[12px] text-(--l-muted)">04 / TASKS</p>
              <h3 className="font-semibold text-[clamp(28px,_2.6vw,_36px)] leading-[1.1] tracking-[-0.035em]">Every worker.<br />Today's job.</h3>
              <p className="mt-4.5 text-[15px] text-(--l-body)">Plan the day per person, per site.</p>
            </div>
            <div>
              <p className="max-w-[330px] text-[15px] leading-[1.55] text-(--l-body)">Give a worker a task for a day and a site, then follow it from To do to In progress to Done. Filter by site, person or status to see what is still open.</p>
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
  );
}
