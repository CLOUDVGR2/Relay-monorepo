/** Service-layer logic for auth user service in the Relay NestJS API. */

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AUTH_USER_MODEL } from './auth-user.schema.js';

// Provide read-only access to account identities owned by the Express service.
@Injectable()
export class AuthUserService {
  constructor(
    @InjectModel(AUTH_USER_MODEL)
    private readonly users: Model<Record<string, unknown>>,
  ) {}

  // Reject otherwise valid tokens when their account has been deleted.
  async exists(userId: string): Promise<boolean> {
    const user = await this.users.findById(userId).select('_id').lean().exec();

    return user !== null;
  }

  // Return the existing account IDs from a proposed participant list.
  async findExistingUserIds(userIds: string[]): Promise<string[]> {
    if (userIds.length === 0) {
      return [];
    }

    const objectIds = userIds.map((userId) => new Types.ObjectId(userId));

    const users = await this.users
      .find({ _id: { $in: objectIds } })
      .select('_id')
      .lean()
      .exec();

    return users.map((user) => String(user._id).toLowerCase());
  }
}
