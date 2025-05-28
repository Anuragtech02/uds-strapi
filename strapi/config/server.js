module.exports = ({ env }) => ({
  host: env("HOST", "0.0.0.0"),
  port: env.int("PORT", 1337),
  admin: {
    auth: {
      secret: env("ADMIN_JWT_SECRET"),
    },
  },
  app: {
    keys: env.array("APP_KEYS"),
  },
  url: env("PUBLIC_URL", "https://web-server-india.univdatos.com"),
  webhooks: {
    populateRelations: env.bool("WEBHOOKS_POPULATE_RELATIONS", false),
  },
  razorpay: {
    key_id: env("RAZORPAY_KEY_ID"),
    key_secret: env("RAZORPAY_KEY_SECRET"),
  },
  cron: {
    enabled: true,
  },
});
