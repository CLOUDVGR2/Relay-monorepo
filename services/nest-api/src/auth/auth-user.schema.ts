/** Schema definition and validation for auth user schema in the Relay NestJS API. */

import { Schema } from 'mongoose';

// Reuse the existing Express application's MongoDB users collection.
// This lookup-only schema deliberately leaves account fields unchanged.
export const AUTH_USER_MODEL = 'AuthUser';

export const authUserSchema = new Schema(
  {},
  {
    collection: 'users',
    strict: false,
  },
);
