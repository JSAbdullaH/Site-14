const AppError = require('../utils/AppError');
const { verifyAccessToken } = require('../utils/jwt');
const userModel = require('../models/user.model');
const { forCompany } = require('../config/db');
const ingestService = require('../services/ingest.service');

const unauthenticated = (message = 'Authentication required') => new AppError(401, 'UNAUTHENTICATED',
message);

async function authenticate(req, _res, next) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) throw unauthenticated();
    const claims = verifyAccessToken(header.slice(7).trim());

    const user = await userModel.findById(claims.userId);
    if (!user || !user.isActive || user.companyId !== claims.companyId) {
        throw unauthenticated('Invalid or expired token');
    }
    req.auth = { userId: user.id, companyId: user.companyId, role: user.role, db: forCompany(user.companyId) };
    next();
}

const requireRole = (...allowed) => (req, _res, next) => {
    const auth = req.auth;
    if (!auth) throw unauthenticated();
    if (auth.role === 'company_admin' || allowed.includes(auth.role)) return next();
    throw new AppError(403, 'FORBIDDEN', 'You do not have permission to do this');
};

const requireAdmin = requireRole('company_admin');

// Devices do not sign in. Each sends its serial and the key it was given at registration.
async function authenticateDevice(req, _res, next) {
    req.device = await ingestService.authenticate(req.get('X-Device-Serial'), req.get('X-Device-Key'));
    next();
}

module.exports = { authenticate, requireRole, requireAdmin, authenticateDevice };
