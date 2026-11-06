// src/middleware/roleMiddleware.js
// Role-based access control factory.
// Usage: requireRole('farmer', 'admin')
// Must be used AFTER authenticate middleware so req.user is populated.

const VALID_ROLES = ['farmer', 'fpo', 'processor', 'retailer', 'government', 'admin'];

export function requireRole(...allowedRoles) {
  // Validate at startup that the developer passed recognised role strings
  allowedRoles.forEach((r) => {
    if (!VALID_ROLES.includes(r)) {
      throw new Error(`requireRole: "${r}" is not a valid platform role. Valid roles: ${VALID_ROLES.join(', ')}`);
    }
  });

  return function roleGuard(req, res, next) {
    if (!req.user) {
      // Should never reach here if authenticate() is used first — defensive check
      return res.status(401).json({
        error: {
          message: 'Authentication required before role check.',
          code: 'AUTH_REQUIRED',
        },
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: {
          message: `Access denied. This endpoint requires one of the following roles: [${allowedRoles.join(', ')}]. Your role is: ${req.user.role}`,
          code: 'ROLE_FORBIDDEN',
        },
      });
    }

    next();
  };
}
