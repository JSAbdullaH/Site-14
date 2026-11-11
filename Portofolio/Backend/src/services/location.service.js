const AppError = require('../utils/AppError');
const geofenceModel = require('../models/geofence.model');
const locationModel = require('../models/location.model');
const { offlineAfterMs } = require('./presence.service');

function locationStatus(row) {
  if (row.sessionId === null) return 'off_site';
  return row.geofence ? 'in_zone' : 'on_site';
}

function liveStatus(row, zoned, now) {
  if (row.sessionId === null) return 'off_site';
  const seen = row.employee.device && row.employee.device.lastSeenAt;
  if (!seen || now - seen.getTime() > offlineAfterMs()) return 'offline';
  if (row.geofence) return 'in_zone';
  return zoned ? 'out_of_zone' : 'on_site';
}

async function live(auth, { site_id: siteId }) {
  const site = await geofenceModel.findSite(auth.companyId, siteId);
  if (!site) throw new AppError(404, 'NOT_FOUND', 'Site not found');
  const [rows, zones] = await Promise.all([locationModel.liveBySite(auth.companyId, siteId), locationModel.activeZoneCount(siteId)]);
  const now = Date.now();
  return {
    site_id: site.id,
    site: { id: site.id, name: site.name, boundary: site.boundary },
    offline_after_minutes: Math.round(offlineAfterMs() / 60_000),
    data: rows.map((r) => {
      const device = r.employee.device;
      const alert = r.session && r.session.alerts[0];
      return {
        employee_id: r.employeeId,
        full_name: r.employee.fullName,
        job_category: r.employee.jobCategory,
        status: liveStatus(r, zones > 0, now),
        location_status: locationStatus(r),
        zone: r.geofence ? { id: r.geofence.id, name: r.geofence.name, is_outdoor: r.geofence.isOutdoor } : null,
        out_of_zone: alert
          ? { alert_id: alert.id, since: alert.triggeredAt.toISOString(), left_zone: alert.geofence ? alert.geofence.name : null, acknowledged: Boolean(alert.acknowledgedAt) }
          : null,
        device: device
          ? {
              id: device.id,
              serial_number: device.serialNumber,
              name: device.name,
              device_type: device.deviceType,
              last_seen_at: device.lastSeenAt ? device.lastSeenAt.toISOString() : null,
            }
          : null,
        latitude: r.latitude,
        longitude: r.longitude,
        battery_percent: r.batteryPercent,
        heart_rate_bpm: r.heartRateBpm,
        recorded_at: r.recordedAt.toISOString(),
      };
    }),
  };
}

module.exports = { live, locationStatus, liveStatus };
