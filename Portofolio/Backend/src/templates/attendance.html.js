const esc = (v) =>
  String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const hhmm = (d) =>
  d
    ? new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Riyadh' })
    : '&mdash;';

const hours = (minutes) => (minutes / 60).toFixed(2);

const STATUS = {
  present: '',
  absent: '<span class="tag tag-absent">ABSENT</span>',
  no_consent: '<span class="tag tag-unknown">NO CONSENT</span>',
};

function rows(records) {
  return records
    .map(
      (r) => `
      <tr>
        <td>${esc(r.full_name)}</td>
        <td class="mono">${esc(r.employee_number) || '&mdash;'}</td>
        <td class="mono">${r.state === 'present' ? hhmm(r.first_seen) : '&mdash;'}</td>
        <td class="mono">${r.state === 'present' ? hhmm(r.last_seen) : '&mdash;'}</td>
        <td class="mono num">${r.state === 'no_consent' ? '&mdash;' : hours(r.total_minutes)}</td>
        <td>${STATUS[r.state]}${r.has_gap ? '<span class="tag tag-gap">GAP</span>' : ''}</td>
      </tr>`,
    )
    .join('');
}

function alertRows(alerts) {
  if (!alerts.length) return '<p class="none">No alerts in this period.</p>';
  return `<table class="t">
    <thead><tr><th>Time</th><th>Employee</th><th>Alert</th><th>Zone</th></tr></thead>
    <tbody>${alerts
      .map(
        (a) => `<tr>
          <td class="mono">${hhmm(a.triggered_at)}</td>
          <td>${esc(a.full_name)}</td>
          <td>${esc(a.alert_type).replace(/_/g, ' ')}</td>
          <td>${esc(a.zone) || '&mdash;'}</td>
        </tr>`,
      )
      .join('')}</tbody></table>`;
}

function render(data) {
  const { site, period, issuer, reference, records, alerts, totals, provisional } = data;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(reference)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; font-size: 10.5px; color: #1A1A1A; margin: 0; }
  h1 { font-size: 15px; margin: 0 0 2px; letter-spacing: -0.01em; }
  .sub { color: #6B6B6B; margin: 0 0 14px; }
  .meta { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  .meta td { padding: 2px 0; vertical-align: top; }
  .meta .k { color: #6B6B6B; width: 70px; }
  .t { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  .t th { text-align: left; font-weight: 600; background: #F7F7F6; border-bottom: 1px solid #E8E6E3; padding: 5px 6px; }
  .t td { border-bottom: 1px solid #F0EEEB; padding: 5px 6px; }
  .mono { font-variant-numeric: tabular-nums; }
  .num { text-align: right; }
  .tag { display: inline-block; font-size: 8.5px; font-weight: 600; letter-spacing: .04em; padding: 1px 5px; border-radius: 3px; margin-right: 4px; }
  .tag-absent { background: #FBE6E4; color: #B42318; }
  .tag-unknown { background: #FBF0D9; color: #9A6B00; }
  .tag-gap { background: #E0F0F5; color: #15607A; }
  .totals td { background: #F7F7F6; padding: 7px 6px; font-weight: 600; }
  .none { color: #6B6B6B; font-style: italic; margin: 0 0 16px; }
  h2 { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #6B6B6B; margin: 18px 0 6px; }
  .banner { background: #FBF0D9; color: #9A6B00; font-weight: 600; padding: 6px 8px; border-radius: 4px; margin-bottom: 12px; }
  .note { color: #6B6B6B; margin-top: 14px; line-height: 1.5; }
</style></head>
<body>
  <h1>Attendance register</h1>
  <p class="sub">SITE14 &middot; generated from recorded device sessions</p>

  ${provisional ? '<div class="banner">PROVISIONAL &mdash; this period is still in progress.</div>' : ''}

  <table class="meta">
    <tr><td class="k">Site</td><td><strong>${esc(site.name)}</strong></td>
        <td class="k">Client</td><td>${esc(site.client) || '&mdash;'}</td></tr>
    <tr><td class="k">Period</td><td>${esc(period.label)}</td>
        <td class="k">Shift</td><td class="mono">${esc(site.shift)}</td></tr>
    <tr><td class="k">Issued</td><td>${esc(issuer.at)}</td>
        <td class="k">By</td><td>${esc(issuer.name)}</td></tr>
  </table>

  <table class="t">
    <thead><tr>
      <th>Employee</th><th>No.</th><th>In</th><th>Out</th><th class="num">Hours</th><th>Status</th>
    </tr></thead>
    <tbody>${rows(records)}</tbody>
    <tfoot><tr class="totals">
      <td colspan="4">${totals.roster} on roster &middot; ${totals.present} present &middot; ${totals.absent} absent &middot; ${totals.no_consent} not tracked</td>
      <td class="num">${hours(totals.minutes)}</td><td></td>
    </tr></tfoot>
  </table>

  <h2>Alerts</h2>
  ${alertRows(alerts)}

  <p class="note">
    ABSENT means the worker is on the roster and no device reading was recorded.
    NO CONSENT means no tracking consent is on file, so no session could be opened and presence is unknown; it is not a record of absence.
    GAP means readings stopped during the shift; the missing time is not counted as worked.
  </p>
</body></html>`;
}

module.exports = { render };
