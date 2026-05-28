import { Router } from 'express';
import { dealerController } from './dealer.controller';
import { requireAuth } from '@/middlewares/requireAuth';

const router = Router();

// All dealer routes require B2C citizen authentication
router.use(requireAuth);

/**
 * @route   GET /api/dealer/inventory
 * @desc    List all vehicles assigned to this dealer
 * @access  Private (Citizen - Dealer)
 */
router.get('/inventory', dealerController.listInventory);

/**
 * @route   GET /api/dealer/trade-certs
 * @desc    List all active trade certificates
 * @access  Private (Citizen - Dealer)
 */
router.get('/trade-certs', dealerController.listTradeCerts);

/**
 * @route   POST /api/dealer/sale-requests
 * @desc    Submit a registration request to the RTO
 * @access  Private (Citizen - Dealer)
 */
router.post('/sale-requests', dealerController.createSaleRequest);

export { router as dealerRoutes };
