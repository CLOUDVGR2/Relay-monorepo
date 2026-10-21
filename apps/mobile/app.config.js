/** Permit local HTTP only in development; preview and production builds require HTTPS. */
module.exports = ({ config }) => {
  const profile = process.env.EAS_BUILD_PROFILE;
  const productionLikeBuild =
    profile === "preview" || profile === "production" ||
    (!profile && process.env.NODE_ENV === "production");

  return {
    ...config,
    android: {
      ...config.android,
      usesCleartextTraffic: !productionLikeBuild,
    },
  };
};
