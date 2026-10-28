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
      employee: { select: { fullName: true, jobCategory: true } },
      geofence: { select: { id: true, name: true, isOutdoor: true } },
    },
    orderBy: { employeeId: 'asc' },
  });
}

module.exports = { liveBySite };
