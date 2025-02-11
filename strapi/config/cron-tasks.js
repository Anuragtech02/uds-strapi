// config/cron-tasks.js
module.exports = {
  "* * * * *": {
    task: async () => {
      console.log("Cron job started:", new Date());
      try {
        await strapi.service("api::sitemap.custom-sitemap").generateSitemap();
        console.log("Sitemap generated successfully");
      } catch (error) {
        console.error("Sitemap generation failed:", error);
      }
    },
    options: {
      tz: "UTC",
    },
  },
};
