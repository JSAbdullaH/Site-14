import { Link } from "react-router-dom";

export default function Landing() {
  return (
    <main className="min-h-screen bg-page flex flex-col">
      <nav className="flex items-center justify-between px-12 py-8">
        <span className="text-xl font-bold tracking-tight">SITE14</span>
        <div className="flex items-center gap-6">
          <Link to="/signin" className="text-sm font-bold text-ink hover:text-signal">
            Sign in
          </Link>
          <Link
            to="/signup"
            className="h-10 px-5 rounded-ctrl bg-signal text-white text-sm font-bold inline-flex items-center hover:bg-signal-dark transition-colors"
          >
            Sign up
          </Link>
        </div>
      </nav>

      <div className="flex-1 flex flex-col justify-center px-12 pb-24">
        <h1 className="max-w-[640px] text-[56px] leading-[1.14] font-bold tracking-tight">
          Know what happened <span className="text-signal">on site.</span> Not what
          was written down later.
        </h1>

        <p className="mt-10 max-w-[48ch] text-lg leading-relaxed text-muted font-semibold">
          SITE14 records attendance, zones and hours as they happen in the field, so
          the daily record is the work itself and not a form filled in afterwards.
        </p>

        <Link
          to="/signup"
          className="mt-12 h-12 px-6 rounded-ctrl bg-signal text-white font-bold inline-flex items-center w-fit hover:bg-signal-dark transition-colors"
        >
          Create your company account
        </Link>
      </div>
    </main>
  );
}