const { prisma } = require('../config/db');

function rosterBySite(companyId, siteId) {
  return prisma.employee.findMany({
    where: { companyId, siteId, status: 'active' },
    orderBy: { fullName: 'asc' },
    select: {
      id: true,
      fullName: true,
      jobCategory: true,
      employeeNumber: true,
      consentGivenAt: true,
      device: {
        select: { id: true, serialNumber: true, name: true, deviceType: true, lastSeenAt: true, isActive: true, lastBatteryPercent: true },
      },
      currentState: {
        select: {
          sessionId: true,
          latitude: true,
          longitude: true,
          batteryPercent: true,
          heartRateBpm: true,
          recordedAt: true,
          geofence: { select: { id: true, name: true, isOutdoor: true } },
          session: {
            select: {
              startedAt: true,
              siteId: true,
              alerts: {
                where: { alertType: 'zone_exit', resolvedAt: null },
                select: { id: true, triggeredAt: true, acknowledgedAt: true, geofence: { select: { name: true } } },
                take: 1,
              },
            },
          },
        },
      },
    },
  });
}

function activeZoneCount(siteId) {
  return prisma.geofence.count({ where: { siteId, isActive: true } });
}

module.exports = { rosterBySite, activeZoneCount };
