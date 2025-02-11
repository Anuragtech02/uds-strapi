// src/api/sitemap/services/custom-sitemap.js
module.exports = {
  async generateSitemap() {
    try {
      console.log("Generating custom sitemap");
      // Get the original sitemap from the plugin
      const sitemapService = strapi.plugin("sitemap").service("sitemap");
      const originalSitemap = await sitemapService.get();

      // Get your supported languages
      const languages = ["ja", "es"]; // Add languages except default

      // Parse the original sitemap entries and create new ones for each language
      const newEntries = [];

      originalSitemap.urls.forEach((entry) => {
        // Keep the original entry
        newEntries.push(entry);

        // Create entries for other languages
        languages.forEach((lang) => {
          newEntries.push({
            ...entry,
            url: `/${lang}${entry.url}`, // Prepend language code
          });
        });
      });

      // Create the new sitemap XML
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
          <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
            ${newEntries
              .map(
                (entry) => `
              <url>
                <loc>${process.env.SITE_URL}${entry.url}</loc>
                <lastmod>${entry.lastmod}</lastmod>
                <changefreq>${entry.changefreq}</changefreq>
                <priority>${entry.priority}</priority>
              </url>
            `
              )
              .join("")}
          </urlset>`;

      const uploadConfig = {
        data: Buffer.from(xml),
        name: "sitemap.xml",
        type: "text/xml",
        path: "sitemaps",
        overwrite: true, // This ensures it replaces existing file
      };
      // Upload to S3
      const s3Service = strapi.plugin("upload").service("upload");
      await s3Service.upload(uploadConfig);

      const existingFiles = await strapi.query("plugin::upload.file").findMany({
        where: {
          name: "sitemap.xml",
          folder: {
            path: "sitemaps",
          },
        },
      });

      if (existingFiles.length > 0) {
        // Delete existing file
        await strapi
          .plugin("upload")
          .service("upload")
          .remove(existingFiles[0]);
      }

      // Upload new file
      await strapi.plugin("upload").service("upload").upload(uploadConfig);

      return { success: true };
    } catch (error) {
      console.error("Sitemap generation error:", error);
      throw error;
    }
  },
};
