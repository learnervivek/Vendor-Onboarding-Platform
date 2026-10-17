import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { VendorProfile } from '../models/vendor-profile.js';

const router = Router();
router.use(requireAuth, requireRole('admin'));

router.get('/summary', async (_request, response, next) => {
  try {
    const [total, pending, approved, rejected, trend] = await Promise.all([
      VendorProfile.countDocuments(),
      VendorProfile.countDocuments({ status: { $in: ['submitted', 'under_review'] } }),
      VendorProfile.countDocuments({ status: 'approved' }),
      VendorProfile.countDocuments({ status: 'rejected' }),
      VendorProfile.aggregate([{ $match: { submittedAt: { $ne: null } } }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$submittedAt' } }, count: { $sum: 1 } } }, { $sort: { _id: 1 } }, { $limit: 30 }])
    ]);
    response.json({ data: { total, pending, approved, rejected, trend } });
  } catch (error) { next(error); }
});

export default router;
