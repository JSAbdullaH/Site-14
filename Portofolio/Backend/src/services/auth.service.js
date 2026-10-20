const crypto = require('node:crypto');
const config = require('../config');
const {
    prisma,
    Prisma
} = require('../config/db');
const AppError = require('../utils/AppError');
const {
    burnPasswordCheck,
    hashPassword,
    verifyPassword
} = require('../utils/password');
const {
    signAccessToken
} = require('../utils/jwt');
const {
    codeHash,
    safeEqual
} = require('../utils/tokens');
const companyModel = require('../models/company.model');
const userModel = require('../models/user.model');
const authTokens = require('../models/authToken.model');
const refreshTokens = require('../models/refreshToken.model');
const mail = require('./mail.service');

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const invalidCredentials = () =>
    new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
const invalidCode = () =>
    new AppError(401, 'INVALID_CODE', 'The code is incorrect or has expired. Sign in again to get a new one.');
const invalidVerifyCode = () =>
    new AppError(401, 'INVALID_CODE', 'The code is incorrect or has expired. Ask for a new code.');
const invalidLink = () =>
    new AppError(400, 'INVALID_TOKEN', 'This link is invalid, has expired, or was already used');
const invalidSession = () =>
    new AppError(401, 'INVALID_REFRESH_TOKEN', 'Your session has ended. Sign in again.');

const isUniqueViolation = (err) =>
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';

const canSignIn = (user) =>
    user && user.isActive && user.passwordHash && (!config.REQUIRE_EMAIL_VERIFICATION || user.isEmailVerified);

async function sendQuietly(fn) {
    try {
        await fn();
    } catch (err) {
        console.error('Email could not be sent:', err.message);
    }
}

const verificationTimings = () => ({
    code_expires_in: config.EMAIL_VERIFY_TTL_MINUTES * 60,
    resend_after: config.EMAIL_VERIFY_RESEND_SECONDS,
});

async function sendVerificationCode(user) {
    const code = await authTokens.issueCode(prisma, {
        userId: user.id,
        tokenType: 'email_verify',
        ttlMs: config.EMAIL_VERIFY_TTL_MINUTES * MINUTE,
    });
    await mail.sendVerificationCode(user.email, {
        fullName: user.fullName,
        code
    });
}

async function useCode(userId, tokenType, code) {
    const row = await authTokens.findActiveCode(userId, tokenType);
    if (!row) return false;
    if (!(await authTokens.spendAttempt(row.id, config.OTP_MAX_ATTEMPTS))) return false;
    if (!safeEqual(codeHash(row.id, code), row.tokenHash)) return false;
    return authTokens.consumeById(row.id);
}

async function issueSession(user, db = prisma) {
    const {
        token,
        expiresIn
    } = signAccessToken({
        userId: user.id,
        companyId: user.companyId,
        role: user.role
    });
    const refreshToken = await refreshTokens.create(db, {
        userId: user.id,
        ttlMs: config.REFRESH_TOKEN_TTL_DAYS * DAY,
    });
    return {
        access_token: token,
        refresh_token: refreshToken,
        expires_in: expiresIn,
        user: userModel.toPublic(user),
    };
}

async function refresh(token) {
    if (!token) throw invalidSession();
    const userId = await refreshTokens.findValid(token);
    const user = userId && (await userModel.findById(userId));
    if (!canSignIn(user)) throw invalidSession();
    const {
        token: accessToken,
        expiresIn
    } = signAccessToken({
        userId: user.id,
        companyId: user.companyId,
        role: user.role,
    });
    return {
        access_token: accessToken,
        expires_in: expiresIn,
        user: userModel.toPublic(user)
    };
}

async function logout({
    token,
    userId
}) {
    if (token) await refreshTokens.revoke({
        token,
        userId
    });
}


async function register(input) {
    const passwordHash = await hashPassword(input.password);
    let created;
    try {
        created = await prisma.$transaction(async (tx) => {
            const company = await companyModel.create(tx, {
                name: input.company_name,
                commercialRegistration: input.commercial_registration,
            });
            const user = await userModel.create(tx, {
                companyId: company.id,
                fullName: input.full_name,
                email: input.email,
                passwordHash,
                role: 'company_admin',
            });
            return {
                company,
                user
            };
        });
    } catch (err) {
        if (!isUniqueViolation(err)) throw err;
        const owner = await userModel.findByEmail(input.email);
        if (owner) await sendQuietly(() => mail.sendAlreadyRegistered(owner.email, {
            fullName: owner.fullName
        }));
        return {
            user: {
                id: crypto.randomUUID(),
                full_name: input.full_name,
                email: input.email,
                role: 'company_admin',
                company_id: crypto.randomUUID(),
                is_active: true,
                is_email_verified: false,
                invitation_pending: false,
                created_at: new Date()
                    .toISOString(),
            },
            company: {
                name: input.company_name
            },
            verification_required: config.REQUIRE_EMAIL_VERIFICATION,
            ...verificationTimings(),
        };
    }

    await sendQuietly(() => sendVerificationCode(created.user));
    return {
        user: userModel.toPublic(created.user),
        company: {
            name: input.company_name
        },
        verification_required: config.REQUIRE_EMAIL_VERIFICATION,
        ...verificationTimings(),
    };
}

async function verifyEmail({
    email,
    code
}) {
    const user = await userModel.findByEmail(email);
    if (!user || user.isEmailVerified || !(await useCode(user.id, 'email_verify', code))) {
        throw invalidVerifyCode();
    }
    await userModel.update(prisma, user.id, {
        isEmailVerified: true
    });
    return {
        verified: true
    };
}

async function resendVerification({
    email
}) {
    const user = await userModel.findByEmail(email);
    if (!user || !user.isActive || !user.passwordHash || user.isEmailVerified) return;
    const last = await authTokens.lastIssuedAt(user.id, 'email_verify');
    if (last && Date.now() - last.getTime() < config.EMAIL_VERIFY_RESEND_SECONDS * 1000) return;
    await sendQuietly(() => sendVerificationCode(user));
}

async function login(input) {
    const user = await userModel.findByEmail(input.email);

    if (!user || !user.passwordHash) {
        await burnPasswordCheck(input.password);
        throw invalidCredentials();
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
        await burnPasswordCheck(input.password);
        throw invalidCredentials();
    }

    const ok = await verifyPassword(user.passwordHash, input.password);
    if (!ok) {
        await userModel.registerFailure(user.id);
        throw invalidCredentials();
    }

    if (!user.isActive) throw invalidCredentials();
    if (config.REQUIRE_EMAIL_VERIFICATION && !user.isEmailVerified) {
        throw new AppError(403, 'EMAIL_NOT_VERIFIED', 'Confirm your email address before signing in');
    }

    await userModel.resetFailures(user.id);

    const cooldownMs = config.LOGIN_OTP_RESEND_SECONDS * 1000;
    const live = await authTokens.findActiveCode(user.id, 'login_otp');
    if (live && Date.now() - live.createdAt.getTime() < cooldownMs) {
        return {
            code_required: true,
            expires_in: Math.ceil((live.expiresAt.getTime() - Date.now()) / 1000),
            resend_after: Math.ceil((live.createdAt.getTime() + cooldownMs - Date.now()) / 1000),
        };
    }

    const ttlMs = config.LOGIN_OTP_TTL_MINUTES * MINUTE;
    const code = await authTokens.issueCode(prisma, {
        userId: user.id,
        tokenType: 'login_otp',
        ttlMs
    });
    await mail.sendLoginCode(user.email, {
        fullName: user.fullName,
        code
    });

    return {
        code_required: true,
        expires_in: ttlMs / 1000,
        resend_after: config.LOGIN_OTP_RESEND_SECONDS
    };
}

async function verifyLogin({
    email,
    code
}) {
    const user = await userModel.findByEmail(email);
    if (!canSignIn(user)) throw invalidCode();

    if (!(await useCode(user.id, 'login_otp', code))) throw invalidCode();
    return issueSession(user);
}

async function forgotPassword({
    email
}) {
    const user = await userModel.findByEmail(email);
    if (!user || !user.isActive || !user.passwordHash) return;
    await sendQuietly(async () => {
        const token = await authTokens.issueLinkToken(prisma, {
            userId: user.id,
            tokenType: 'password_reset',
            ttlMs: config.PASSWORD_RESET_TTL_MINUTES * MINUTE,
        });
        await mail.sendPasswordReset(user.email, {
            fullName: user.fullName,
            token
        });
    });
}

async function resetPassword({
    token,
    password
}) {
    const passwordHash = await hashPassword(password);
    const ok = await prisma.$transaction(async (tx) => {
        const userId = await authTokens.consumeLinkToken(tx, {
            token,
            tokenType: 'password_reset'
        });
        if (!userId) return false;
        await userModel.update(tx, userId, {
            passwordHash,
            failedLoginCount: 0,
            lockedUntil: null,
            isEmailVerified: true,
        });
        await refreshTokens.revokeAllForUser(tx, userId);
        return true;
    });
    if (!ok) throw invalidLink();
    return {
        reset: true
    };
}

module.exports = {
    register,
    verifyEmail,
    resendVerification,
    login,
    verifyLogin,
    refresh,
    logout,
    forgotPassword,
    resetPassword,
    issueSession,
};
