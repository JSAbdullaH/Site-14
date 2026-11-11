const { prisma } = require('../config/db');

function liveBySite(companyId, siteId) {
  return prisma.employeeCurrentState.findMany({
    where: { employee: { companyId, siteId, status: 'active' } },
    select: {
      employeeId: true,
      sessionId: true,
      latitude: true,
      longitude: true,
      batteryPercent: true,
      heartRateBpm: true,
      recordedAt: true,
      employee: {
        select: {
          fullName: true,
          jobCategory: true,
          device: { select: { id: true, serialNumber: true, name: true, deviceType: true, lastSeenAt: true, isActive: true } },
        },
      },
      geofence: { select: { id: true, name: true, isOutdoor: true } },
      session: {
        select: {
          alerts: {
            where: { alertType: 'zone_exit', resolvedAt: null },
            select: { id: true, triggeredAt: true, acknowledgedAt: true, geofence: { select: { name: true } } },
            take: 1,
          },
        },
      },
    },
    orderBy: { employeeId: 'asc' },
  });
}

function activeZoneCount(siteId) {
  return prisma.geofence.count({ where: { siteId, isActive: true } });
}

module.exports = { liveBySite, activeZoneCount };
