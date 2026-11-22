const { prisma } = require('../config/db');

function create(db, data) {
  return db.report.create({ data });
}

function findByReference(referenceNumber) {
  return prisma.report.findUnique({
    where: { referenceNumber },
    select: {
      referenceNumber: true,
      reportType: true,
      periodStart: true,
      periodEnd: true,
      sha256: true,
      fileSizeBytes: true,
      createdAt: true,
      site: { select: { name: true, client: true } },
      creator: { select: { fullName: true } },
    },
  });
}

module.exports = { create, findByReference };
