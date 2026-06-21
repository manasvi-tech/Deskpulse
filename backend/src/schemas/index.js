const { z } = require('zod');

const loginSchema = z.object({
  body: z.object({
    email:    z.string().email('Invalid email format'),
    password: z.string().min(1, 'Password is required'),
  }),
});

const memberSchema = z.object({
  body: z.object({
    name:        z.string().min(1).max(100),
    email:       z.string().email(),
    phone:       z.string().regex(/^[789]\d{9}$/, 'Invalid Indian phone number'),
    plan_type:   z.enum(['day_pass', 'hot_desk', 'dedicated_desk', 'private_office']),
    location_id: z.string().uuid().optional(),
    start_date:  z.string().datetime({ offset: true }).optional(),
  }),
});

const renewSchema = z.object({
  body: z.object({
    plan_type: z.enum(['day_pass', 'hot_desk', 'dedicated_desk', 'private_office']),
  }),
  params: z.object({
    id: z.string().uuid('Invalid member ID'),
  }),
});

const checkinSchema = z.object({
  body: z.object({
    member_id: z.string().uuid('Invalid member ID'),
  }),
});

const paginationSchema = z.object({
  query: z.object({
    page:        z.coerce.number().int().min(1).default(1),
    limit:       z.coerce.number().int().min(1).max(100).default(20),
    search:      z.string().max(100).optional(),
    location_id: z.string().uuid().optional(),
  }),
});

const simulatorSchema = z.object({
  body: z.object({
    speed: z.coerce.number().int().refine((v) => [1, 5, 10].includes(v), {
      message: 'Speed must be 1, 5, or 10',
    }),
  }),
});

const userSchema = z.object({
  body: z.object({
    name:        z.string().min(1).max(100),
    email:       z.string().email(),
    password:    z.string().min(8, 'Password must be at least 8 characters'),
    role:        z.enum(['super_admin', 'frontdesk']),
    location_id: z.string().uuid().optional(),
  }),
});

const anomalyParamsSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid anomaly ID'),
  }),
});

module.exports = {
  loginSchema,
  memberSchema,
  renewSchema,
  checkinSchema,
  paginationSchema,
  simulatorSchema,
  userSchema,
  anomalyParamsSchema,
};
