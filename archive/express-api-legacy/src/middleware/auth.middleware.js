/** Request middleware for auth middleware in the Relay archived legacy Express implementation. */

import jwt from "jsonwebtoken";
import mongoose from "mongoose";

import User from "../models/user.model.js";

// Keep these values aligned with the JWT generation configuration.
const AUTH_COOKIE_NAME = "jwt";
const JWT_ALGORITHMS = ["HS256"];

// Use a consistent response to avoid revealing account or token details.
const UNAUTHORIZED_RESPONSE = {
  success: false,
  message: "Authentication required",
};

/**
 * Rejects unauthenticated requests with a consistent response.
 *
 * Deliberately avoids exposing whether a token was missing, expired,
 * malformed, or associated with a deleted account.
 */
function rejectAuthentication(res) {
  return res.status(401).json(UNAUTHORIZED_RESPONSE);
}

/**
 * Authenticates requests using the JWT stored in the HTTP-only cookie.
 *
 * On success, attaches a minimal user object to req.user and continues
 * the Express middleware chain.
 *
 * Authentication failures return 401. Unexpected operational failures
 * are forwarded to the centralized Express error handler.
 */
export const protectRoute = async (req, res, next) => {
  // Read the authentication cookie safely in case cookie parsing is absent.
  const token = req.cookies?.[AUTH_COOKIE_NAME];

  if (typeof token !== "string" || token.length === 0) {
    return rejectAuthentication(res);
  }

  // JWT_SECRET must also be validated at application startup.
  // This check is a defensive fallback, not the primary configuration check.
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    return next(new Error("JWT_SECRET is not configured"));
  }

  let payload;

  try {
    // Verify the signature, expiration, and other registered JWT claims.
    // Restrict accepted algorithms to the one used by the token issuer.
    payload = jwt.verify(token, secret, {
      algorithms: JWT_ALGORITHMS,
    });
  } catch (error) {
    // Invalid, expired, or not-yet-valid tokens are authentication failures.
    // Do not expose internal JWT verification details to clients.
    if (error instanceof jwt.JsonWebTokenError) {
      return rejectAuthentication(res);
    }

    // Forward unexpected errors instead of incorrectly treating every
    // verification failure as an invalid credential.
    return next(error);
  }

  // A valid signature does not guarantee that the payload has the structure
  // this application requires. Validate the identity before querying MongoDB.
  if (
    typeof payload !== "object" ||
    payload === null ||
    typeof payload.userId !== "string" ||
    !mongoose.isObjectIdOrHexString(payload.userId)
  ) {
    return rejectAuthentication(res);
  }

  try {
    // Fetch only the fields required by downstream authenticated handlers.
    // lean() avoids creating a full Mongoose document for this read-only lookup.
    // The password field is excluded by the explicit projection and the
    // User schema's select:false configuration.
    const user = await User.findById(payload.userId)
      .select("_id email fullName profilePic")
      .lean()
      .exec();

    // A token can remain cryptographically valid after its account is deleted.
    // The account must still exist for the request to be authenticated.
    if (!user) {
      return rejectAuthentication(res);
    }

    // Make the authenticated identity available to downstream middleware
    // and controllers without exposing the password hash.
    req.user = user;

    return next();
  } catch (error) {
    // Database and other operational failures belong in centralized error
    // handling, not in the 401 authentication-failure response.
    return next(error);
  }
};
