module.exports = {
  routes: [
    {
      method: "GET",
      path: "/custom-sitemap/generate",
      handler: "custom-sitemap.generateSitemap",
      config: {
        policies: [],
      },
    },
  ],
};
