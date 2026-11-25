const AppError = require('../utils/AppError');
const geofenceModel = require('../models/geofence.model');
const locationModel = require('../models/location.model');
const { offlineAfterMs } = require('./presence.service');

const iso = (d) => (d ? d.toISOString() : null);

function locationStatus(state) {
  if (!state || state.sessionId === null) return 'off_site';
  return state.geofence ? 'in_zone' : 'on_site';
}

const onShiftAt = (e, siteId) => {
  const state = e.currentState;
  return Boolean(state && state.sessionId !== null && state.session && state.session.siteId === siteId);
};

// online + inside the site  -> on_site / in_zone / out_of_zone, drawn on the site
// online + outside the site -> off_site, phone working but not drawn
// device silent             -> offline (disconnected: the sweep has ended any shift)
function liveStatus(e, siteId, zoned, now) {
  const device = e.device && e.device.isActive ? e.device : null;
  if (!device) return 'no_device';
  if (!e.consentGivenAt) return 'no_consent';
  if (!device.lastSeenAt) return 'waiting';
  if (now - device.lastSeenAt.getTime() > offlineAfterMs()) return 'offline';
  if (!onShiftAt(e, siteId)) return 'off_site';
  if (e.currentState.geofence) return 'in_zone';
  return zoned ? 'out_of_zone' : 'on_site';
}

function toWorker(e, siteId, zoned, now) {
  const state = e.currentState;
  const device = e.device && e.device.isActive ? e.device : null;
  const alert = state && state.session && state.session.alerts[0];
  // The position is shown only while they are on this site. Off site the server still
  // holds their last on-site position, which would draw them inside the site.
  const positioned = onShiftAt(e, siteId);
  return {
    employee_id: e.id,
    full_name: e.fullName,
    job_category: e.jobCategory,
    employee_number: e.employeeNumber,
    status: liveStatus(e, siteId, zoned, now),
    location_status: locationStatus(state),
    has_position: positioned,
    consent: Boolean(e.consentGivenAt),
    zone: state && state.geofence ? { id: state.geofence.id, name: state.geofence.name, is_outdoor: state.geofence.isOutdoor } : null,
    out_of_zone: alert
      ? { alert_id: alert.id, since: alert.triggeredAt.toISOString(), left_zone: alert.geofence ? alert.geofence.name : null, acknowledged: Boolean(alert.acknowledgedAt) }
      : null,
    shift_started_at: state && state.session && state.sessionId !== null ? iso(state.session.startedAt) : null,
    device: device
      ? {
          id: device.id,
          serial_number: device.serialNumber,
          name: device.name,
          device_type: device.deviceType,
          last_seen_at: iso(device.lastSeenAt),
          online: Boolean(device.lastSeenAt && now - device.lastSeenAt.getTime() <= offlineAfterMs()),
        }
      : null,
    latitude: positioned ? state.latitude : null,
    longitude: positioned ? state.longitude : null,
    battery_percent: positioned && state.batteryPercent !== null ? state.batteryPercent : device ? device.lastBatteryPercent : null,
    heart_rate_bpm: positioned ? state.heartRateBpm : null,
    recorded_at: positioned ? state.recordedAt.toISOString() : null,
  };
}

async function live(auth, { site_id: siteId }) {
  const site = await geofenceModel.findSite(auth.companyId, siteId);
  if (!site) throw new AppError(404, 'NOT_FOUND', 'Site not found');
  const [employees, zones] = await Promise.all([
    locationModel.rosterBySite(auth.companyId, siteId),
    locationModel.activeZoneCount(siteId),
  ]);
  const now = Date.now();
  return {
    site_id: site.id,
    site: { id: site.id, name: site.name, boundary: site.boundary },
    offline_after_minutes: Math.round(offlineAfterMs() / 60_000),
    data: employees.map((e) => toWorker(e, site.id, zones > 0, now)),
  };
}

module.exports = { live, locationStatus, liveStatus };
