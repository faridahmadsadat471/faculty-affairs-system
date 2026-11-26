import User from '../models/user.model.js';
import { httpError } from '../utils/http-error.js';

// Serialize privileged account changes in this single-process local deployment.
// Recheck the acting admin after waiting; a queued request may have lost access.
let accountQueue = Promise.resolve();
export async function withAccountMutation(actor, operation) {
  const previous = accountQueue;
  let release;
  accountQueue = new Promise((resolve) => { release = resolve; });
  await previous;
  try {
    const current = await User.findById(actor._id).select('role isActive +tokenVersion');
    if (!current?.isActive || current.role !== 'system_admin' || (current.tokenVersion || 0) !== (actor.tokenVersion || 0)) throw httpError(403, 'Administrator access is no longer available');
    return await operation();
  } finally { release(); }
}

export async function protectLastAdministrator(user, input) {
  const nextRole = input.role ?? user.role, nextActive = input.isActive ?? user.isActive;
  if (user.role === 'system_admin' && user.isActive && (nextRole !== 'system_admin' || !nextActive)
    && await User.countDocuments({ role: 'system_admin', isActive: true }) <= 1) throw httpError(409, 'The last active administrator cannot be disabled or demoted');
}
