/**
 * Zod validation middleware — validates req.body against a Zod schema.
 *
 * Usage:
 *   router.post('/register', validate(registerSchema), authController.register);
 */

const { ZodError } = require('zod');

function validate(schema) {
  return (req, res, next) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({
          error: 'Validation failed',
          details: err.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
      }
      next(err);
    }
  };
}

module.exports = { validate };
