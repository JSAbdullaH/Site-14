import { Link } from "react-router-dom";

export default function Landing() {
  return (
    <main className="bg-signal">
      <nav className="s14-landing-nav">
        <Link to="/signin" className="s14-textlink">Sign in</Link>
        <Link to="/signup" className="s14-btn s14-btn-sm">Sign up</Link>
      </nav>

      <h1 className="s14-landing-head">
        Know what happened on site. Not what was <em>written down later.</em>
      </h1>

      <p className="s14-landing-body">
        SITE14 records attendance, zones and hours as they happen in the field,
        so the daily record is the work itself and not a form filled in
        afterwards.
      </p>
    </main>
  );
}
