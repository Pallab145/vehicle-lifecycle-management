import { Router } from 'express';
import { authController } from './auth.controller';
import { createServiceRateLimit } from '@/middlewares/rate-limit';
import { requireAuth } from '@/middlewares/requireAuth';

const router = Router();
const authRateLimit = createServiceRateLimit('auth');

router.use(authRateLimit);

// ── Institution (B2B) Routes ──
router.post('/institution/login', authController.loginInstitution);
router.post('/institution/forgot-password', authController.forgotPassword);
router.post('/institution/reset-password', authController.resetPassword);

// ── Citizen (B2C) Routes ──
router.get('/citizen/nonce', authController.getNonce);
router.post('/citizen/login', authController.loginCitizen);

// ── Shared Auth Routes ──
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);
router.get('/me', requireAuth, authController.getMe);

export default router;
