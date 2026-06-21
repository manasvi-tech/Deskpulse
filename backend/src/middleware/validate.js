const { ZodError } = require('zod');
const logger       = require('../utils/logger');

const validate = (schema) => (req, res, next) => {
  try {
    schema.parse({ body: req.body, query: req.query, params: req.params });
    next();
  } catch (err) {
    if (err instanceof ZodError) {
      logger.warn({ errors: err.errors }, '[validate] Request validation failed');
      return res.status(400).json({
        error:   'Invalid request',
        details: err.errors.map((e) => ({
          field:   e.path.join('.'),
          message: e.message,
        })),
      });
    }
    next(err);
  }
};

module.exports = { validate };
