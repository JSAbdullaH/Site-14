// SITE14 owner portal: every company's sites and users, across companies.
const { prisma } = require('../config/db');
const AppError = require('../utils/AppError');
const userModel = require('../models/user.model');
const authTokens = require('../models/authToken.model');
const refreshTokens = require('../models/refreshToken.model');
const { fromTime } = require('../models/site.model');
const { assertCanDeactivate } = require('./site.service');

const page = (q) => ({ skip: (q.page - 1) * q.limit, take: q.limit });

// ---------------------------------------------------------------- users

const USER_FIELDS = {
  id: true,
  fullName: true,
  email: true,
  role: true,
  isActive: true,
  isEmailVerified: true,
  isPlatformAdmin: true,
  passwordHash: true,
  createdAt: true,
  company: { select: { id: true, name: true } },
};

const userToPublic = (u) => ({
  id: u.id,
  full_name: u.fullName,
  email: u.email,
  role: u.role,
  company: u.company,
  is_active: u.isActive,
  is_email_verified: u.isEmailVerified,
  is_platform_admin: u.isPlatformAdmin,
  invitation_pending: userModel.isPendingInvitation(u),
  created_at: u.createdAt.toISOString(),
});

async function users(q) {
  const where = {
    ...(q.company_id && { companyId: q.company_id }),
    ...(q.platform_admin !== undefined && { isPlatformAdmin: q.platform_admin }),
    ...(q.search && {
      OR: [
        { fullName: { contains: q.search, mode: 'insensitive' } },
        { email: { contains: q.search, mode: 'insensitive' } },
        { company: { name: { contains: q.search, mode: 'insensitive' } } },
      ],
    }),
  };
  const [rows, total] = await Promise.all([
    prisma.user.findMany({ where, select: USER_FIELDS, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], ...page(q) }),
    prisma.user.count({ where }),
  ]);
  return { data: rows.map(userToPublic), page: q.page, limit: q.limit, total };
}

// A company keeps at least one active admin, or nobody could manage it any more.
async function assertKeepsAnAdmin(tx, user) {
  const others = await tx.user.count({
    where: { companyId: user.company.id, role: 'company_admin', isActive: true, id: { not: user.id } },
  });
  if (!others) {
    throw new AppError(409, 'LAST_COMPANY_ADMIN', `${user.fullName} is the only admin of ${user.company.name}. Make someone else admin first.`);
  }
}

async function updateUser(platform, id, input) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id }, select: USER_FIELDS });
    if (!user) throw new AppError(404, 'NOT_FOUND', 'User not found');
    const self = platform.kind === 'user' && platform.userId === id;
    const pending = userModel.isPendingInvitation(user);

    if (self && input.is_active === false) throw new AppError(400, 'CANNOT_CHANGE_SELF', 'You cannot deactivate your own account');
    if (self && input.is_platform_admin === false) {
      throw new AppError(400, 'CANNOT_CHANGE_SELF', 'You cannot take away your own owner-portal access');
    }
    if (pending && (input.is_active === true || input.is_platform_admin === true)) {
      throw new AppError(409, 'INVITATION_PENDING', 'This person has not accepted their invitation yet');
    }

    const willBeActive = input.is_active ?? user.isActive;
    if (input.is_platform_admin === true && !willBeActive) {
      throw new AppError(409, 'USER_INACTIVE', 'Reactivate this account before giving it owner-portal access');
    }
    const losesAdmin = user.role === 'company_admin' && user.isActive && (input.role === 'site_manager' || input.is_active === false);
    if (losesAdmin) await assertKeepsAnAdmin(tx, user);

    const data = {
      ...(input.role && { role: input.role }),
      ...(input.is_active !== undefined && { isActive: input.is_active }),
      ...(input.is_platform_admin !== undefined && { isPlatformAdmin: input.is_platform_admin }),
      // A deactivated account loses owner-portal access too.
      ...(input.is_active === false && { isPlatformAdmin: false }),
    };
    if (input.is_active === true && user.isActive === false) data.failedLoginCount = 0;
    const updated = await tx.user.update({ where: { id }, data, select: USER_FIELDS });

    // Signed out everywhere when deactivated or when their role changes.
    if (input.is_active === false || (input.role && input.role !== user.role)) {
      await refreshTokens.revokeAllForUser(tx, id);
      if (input.is_active === false) await authTokens.retireAll(tx, id);
    }
    return userToPublic(updated);
  });
}

// ---------------------------------------------------------------- sites

const SITE_FIELDS = {
  id: true,
  name: true,
  client: true,
  shiftStart: true,
  shiftEnd: true,
  isActive: true,
  createdAt: true,
  company: { select: { id: true, name: true } },
  _count: {
    select: {
      employees: { where: { status: 'active' } },
      workSessions: { where: { endedAt: null } },
      geofences: { where: { isActive: true } },
    },
  },
};

const siteToPublic = (s) => ({
  id: s.id,
  name: s.name,
  client: s.client,
  company: s.company,
  shift_start: fromTime(s.shiftStart),
  shift_end: fromTime(s.shiftEnd),
  is_active: s.isActive,
  employee_count: s._count.employees,
  on_site_count: s._count.workSessions,
  zone_count: s._count.geofences,
  created_at: s.createdAt.toISOString(),
});

async function sites(q) {
  const where = {
    ...(q.company_id && { companyId: q.company_id }),
    ...(q.status && q.status !== 'all' && { isActive: q.status === 'active' }),
    ...(q.search && {
      OR: [
        { name: { contains: q.search, mode: 'insensitive' } },
        { client: { contains: q.search, mode: 'insensitive' } },
        { company: { name: { contains: q.search, mode: 'insensitive' } } },
      ],
    }),
  };
  const [rows, total] = await Promise.all([
    prisma.site.findMany({ where, select: SITE_FIELDS, orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }], ...page(q) }),
    prisma.site.count({ where }),
  ]);
  return { data: rows.map(siteToPublic), page: q.page, limit: q.limit, total };
}

// Same rule as in the company app: a site with people on it or assigned to it stays open.
async function updateSite(id, { is_active: isActive }) {
  return prisma.$transaction(async (tx) => {
    const site = await tx.site.findUnique({ where: { id }, select: { id: true, isActive: true } });
    if (!site) throw new AppError(404, 'NOT_FOUND', 'Site not found');
    if (isActive === false && site.isActive) await assertCanDeactivate(tx, site);
    const updated = await tx.site.update({ where: { id }, data: { isActive }, select: SITE_FIELDS });
    return siteToPublic(updated);
  });
}

module.exports = { users, updateUser, sites, updateSite };
