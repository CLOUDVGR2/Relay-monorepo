/** Shared utility functions for the Relay archived legacy Express implementation. */

import jwt from "jsonwebtoken";

// Keep authentication cookie settings consistent across login and logout.
const COOKIE_NAME = "jwt";
const TOKEN_EXPIRES_IN = "7d";
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

// Read cookie settings from the environment so deployments can configure them.
function getAuthCookieOptions() {
  const isProduction = process.env.NODE_ENV === "production";

  const sameSite = (process.env.COOKIE_SAME_SITE || "strict").toLowerCase();

  // Accept only supported SameSite policies.
  if (!["strict", "lax", "none"].includes(sameSite)) {
    throw new Error("COOKIE_SAME_SITE must be strict, lax, or none");
  }

  // Browsers require Secure cookies when SameSite=None is used.
  if (sameSite === "none" && !isProduction) {
    throw new Error(
      "COOKIE_SAME_SITE=none requires a secure production connection",
    );
  }

  return {
    httpOnly: true,
    secure: isProduction,
    sameSite,
    path: "/",
  };
}

// Create a signed JWT and send it to the client as an HTTP-only cookie.
export const generateToken = (userId, res) => {
  const secret = process.env.JWT_SECRET;

  // Fail immediately rather than issuing a token with missing configuration.
  if (!secret) {
    throw new Error("JWT_SECRET is not configured");
  }

  // Include the authenticated user's ID in the signed token payload.
  const token = jwt.sign({ userId: userId.toString() }, secret, {
    expiresIn: TOKEN_EXPIRES_IN,
  });

  // Set the cookie lifetime to match the JWT expiration.
  res.cookie(COOKIE_NAME, token, {
    ...getAuthCookieOptions(),
    maxAge: COOKIE_MAX_AGE,
  });

  // Preserve the existing return value for callers that need the token.
  return token;
};

// Clear the authentication cookie using the same scope and security settings.
export const clearAuthCookie = (res) => {
  res.clearCookie(COOKIE_NAME, getAuthCookieOptions());
};
