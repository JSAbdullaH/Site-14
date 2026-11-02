const AppError = require('../utils/AppError');
const geofenceModel = require('../models/geofence.model');
const locationModel = require('../models/location.model');

function locationStatus(row) {
  if (row.sessionId === null) return 'off_site';
  return row.geofence ? 'in_zone' : 'on_site';
}

async function live(auth, { site_id: siteId }) {
  const site = await geofenceModel.findSite(auth.companyId, siteId);
  if (!site) throw new AppError(404, 'NOT_FOUND', 'Site not found');
  const rows = await locationModel.liveBySite(auth.companyId, siteId);
  return {
    site_id: site.id,
    site: { id: site.id, name: site.name, boundary: site.boundary },
    data: rows.map((r) => ({
      employee_id: r.employeeId,
      full_name: r.employee.fullName,
      job_category: r.employee.jobCategory,
      location_status: locationStatus(r),
      zone: r.geofence ? { id: r.geofence.id, name: r.geofence.name, is_outdoor: r.geofence.isOutdoor } : null,
      latitude: r.latitude,
      longitude: r.longitude,
      battery_percent: r.batteryPercent,
      heart_rate_bpm: r.heartRateBpm,
      recorded_at: r.recordedAt.toISOString(),
    })),
  };
}

module.exports = { live, locationStatus };
