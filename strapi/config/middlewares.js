module.exports = [
  "strapi::logger",
  "strapi::errors",
  {
    name: "strapi::security",
    config: {
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          "connect-src": ["'self'", "https:", "http"],
          "img-src": [
            "'self'",
            "data:",
            "blob:",
            "market-assets.strapi.io",
            "https://univdatos-cms.s3.ap-south-1.amazonaws.com",
          ],
          "media-src": [
            "'self'",
            "data:",
            "blob:",
            "market-assets.strapi.io",
            "https://univdatos-cms.s3.ap-south-1.amazonaws.com",
          ],
          upgradeInsecureRequests: null,
        },
      },
      cors: {
        origin: [
          "http://localhost:3000",
          "http://localhost:1337",
          "https://univdatos-cms-production.up.railway.app",
        ],
      },
    },
  },
  "strapi::cors",
  "strapi::poweredBy",
  "strapi::query",
  "strapi::body",
  "strapi::session",
  "strapi::favicon",
  "strapi::public",
];
