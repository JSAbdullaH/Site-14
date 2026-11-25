import { qr, watchCells } from "../landingData";
import { PixelGrid } from "../components/PixelGrid";
import { Reveal } from "../components/Reveal";

export function Devices() {
  return (
    <section id="devices" className="bg-(--l-bg) py-30">
      <Reveal className="wrap flex flex-col gap-16">
        <div className="flex flex-col items-center text-center gap-3.5">
          <p className="text-[12px] font-semibold tracking-[.08em] text-[#B93A07]">DEVICES</p>
          <h2 className="font-semibold text-[clamp(30px,_3.4vw,_44px)] tracking-[-0.035em] leading-[1.08] max-w-[640px]">Start with the phones they already carry.</h2>
          <p className="mt-2 max-w-[460px] text-[15px] leading-[1.5] text-(--l-muted)">Three ways to get a device on the map. Mix them on the same site.</p>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,_minmax(min(300px,_100%),_1fr))] gap-5">
          <div className="border border-(--l-line) p-7 flex flex-col gap-5.5">
            <div className="dots h-[200px] flex items-center justify-center gap-5">
              <PixelGrid cells={qr} cols={21} size={5} label="QR code for pairing a device" className="p-2 bg-[#fff] shadow-[0_10px_24px_rgba(0,0,0,.08)]" />
              <div className="flex flex-col gap-1 text-left">
                <span className="text-[11px] text-(--l-muted)">Pairing code</span>
                <span className="font-[Geist_Mono,monospace] text-[18px] font-medium tracking-[.08em]">K7Q-42M</span>
              </div>
            </div>
            <div>
              <h3 className="text-[20px] font-semibold tracking-[-0.02em]">Connect from the browser</h3>
              <p className="mt-2.5 text-[14px] leading-[1.55] text-(--l-body)">Show a QR code. The worker scans it and their phone, tablet, laptop or watch starts sending its location. Nothing to install from an app store.</p>
            </div>
          </div>
          <div className="border border-(--l-line) p-7 flex flex-col gap-5.5">
            <div className="dots h-[200px] flex items-center justify-center px-5 box-border">
              <div className="w-full max-w-[260px] bg-[#fff] rounded-[12px] py-3 px-3.5 shadow-[0_10px_24px_rgba(0,0,0,.08)] text-[11.5px] box-border">
                <div className="font-semibold mb-1.5">Register by serial</div>
                <div className="flex justify-between py-1.5 border-t border-t-(--l-line2) font-[Geist_Mono,monospace]"><span>TRK-0418</span><span className="text-[#2F7D4F]">Added</span></div>
                <div className="flex justify-between py-1.5 border-t border-t-(--l-line2) font-[Geist_Mono,monospace]"><span>TRK-0419</span><span className="text-[#2F7D4F]">Added</span></div>
                <div className="flex justify-between py-1.5 border-t border-t-(--l-line2) font-[Geist_Mono,monospace]"><span>TRK-0420</span><span className="text-[#2F7D4F]">Added</span></div>
                <div className="flex items-center gap-1.5 mt-2 text-[#B93A07] font-semibold">
                  <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12"></path><path d="m7 10 5 5 5-5"></path><path d="M5 21h14"></path></svg>
                  Download keys (.csv)
                </div>
              </div>
            </div>
            <div>
              <h3 className="text-[20px] font-semibold tracking-[-0.02em]">Register by serial</h3>
              <p className="mt-2.5 text-[14px] leading-[1.55] text-(--l-body)">Already own GPS trackers? Add them by serial number and download their device keys in one file.</p>
            </div>
          </div>
          <div className="border border-(--l-line) p-7 flex flex-col gap-5.5">
            <div className="dots h-[200px] flex items-center justify-center">
              <PixelGrid cells={watchCells} cols={14} size={7} gap={1} label="Pixel smartwatch" />
            </div>
            <div>
              <h3 className="text-[20px] font-semibold tracking-[-0.02em]">Buy from SITE14</h3>
              <p className="mt-2.5 text-[14px] leading-[1.55] text-(--l-body)">Order ready-to-go devices from the marketplace. They arrive set up for your company and connect on first power-on.</p>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
