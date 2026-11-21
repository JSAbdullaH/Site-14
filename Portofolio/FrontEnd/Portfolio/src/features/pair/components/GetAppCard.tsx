import { Download, ExternalLink, Smartphone, Watch } from "lucide-react";

const APP_STORE_URL = (import.meta.env.VITE_IOS_APP_URL as string | undefined)?.trim() || "";

const pretty = (code: string) => (code.length > 4 ? `${code.slice(0, 4)}-${code.slice(4)}` : code);

/** On iPhone, tracking runs in the SITE14 app: a browser stops sharing as soon as the screen locks. */
export default function GetAppCard({ code }: { code: string }) {
  const ready = code.length === 8;

  return (
    <div className="rounded-xl border bg-background p-5">
      <span className="flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
        <Smartphone className="size-6" />
      </span>
      <h2 className="mt-3 text-lg font-semibold">Use the SITE14 app</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        On iPhone, SITE14 shares your location through its app, so it keeps working with the screen off and the app
        closed. Your Apple Watch can share too, and both show you where your site is.
      </p>

      <ol className="mt-5 space-y-4">
        <li className="flex gap-3">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold">1</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Install the app</p>
            {APP_STORE_URL ? (
              <a
                href={APP_STORE_URL}
                className="mt-2 inline-flex h-10 items-center gap-2 rounded-lg border px-4 text-sm font-medium hover:bg-secondary"
              >
                <Download className="size-4" />
                Get SITE14 on the App Store
              </a>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">Ask your manager for the SITE14 app link.</p>
            )}
          </div>
        </li>
        <li className="flex gap-3">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold">2</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Connect in the app</p>
            {ready ? (
              <>
                <a
                  href={`site14://pair/${code}`}
                  className="mt-2 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-medium text-primary-foreground"
                >
                  <ExternalLink className="size-4" />
                  Open in SITE14
                </a>
                <p className="mt-2 text-xs text-muted-foreground">
                  Or open the app and type <span className="font-mono font-semibold text-foreground">{pretty(code)}</span>, or scan
                  the QR code from inside the app.
                </p>
              </>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">
                Open the app and scan the QR code on your manager's screen, or type the code shown under it.
              </p>
            )}
          </div>
        </li>
      </ol>

      <p className="mt-5 flex items-center gap-2 border-t pt-4 text-xs text-muted-foreground">
        <Watch className="size-4 shrink-0" />
        Install SITE14 on your Apple Watch from the Watch app on your iPhone. It joins on its own.
      </p>
    </div>
  );
}
