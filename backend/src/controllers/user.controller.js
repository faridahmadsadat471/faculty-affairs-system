import { matchedData } from 'express-validator';
import User from '../models/user.model.js';
import { toPublicUser } from '../utils/user.js';

export async function listUsers(req, res, next) {
  try {
    const { page = 1, limit = 20 } = matchedData(req, { locations: ['query'] });
    const [users, total] = await Promise.all([
      User.find()
        .select('_id fullName email role isActive createdAt')
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      User.countDocuments(),
    ]);

    res.status(200).json({
      users: users.map(toPublicUser),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
}
