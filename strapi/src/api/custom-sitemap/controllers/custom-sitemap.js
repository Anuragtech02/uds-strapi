// src/api/sitemap/services/custom-sitemap.js
module.exports = {
  async generateSitemap() {
    try {
      console.log("Generating custom sitemap");
      // Get the original sitemap from the plugin
      const sitemapPlugin = strapi.plugins.sitemap;
      console.log(sitemapPlugin.services.query.getSitemap);

      const sitemapContent = await sitemapPlugin.services.query.getSitemap(
        "default",
        0,
        ["sitemap_string"]
      );

      // Parse the XML content to get the URLs
      // You might need to use an XML parser here
      const xml2js = require("xml2js");
      const parser = new xml2js.Parser();
      const result = await parser.parseStringPromise(
        sitemapContent.sitemap_string
      );

      // Get your supported languages
      const languages = ["ja", "es"]; // Add languages except default

      // Parse the original sitemap entries and create new ones for each language
      const newEntries = [];

      const urls = result.urlset.url;
      const newUrls = [];

      urls.forEach((urlEntry) => {
        // Keep the original entry
        newUrls.push(urlEntry);

        // Create entries for other languages
        languages.forEach((lang) => {
          newUrls.push({
            ...urlEntry,
            loc: [
              `${urlEntry.loc[0].split("://")[0]}://${urlEntry.loc[0]
                .split("://")[1]
                .replace("/", `/${lang}/`)}`,
            ],
          });
        });
      });

      const builder = new xml2js.Builder();
      const newXml = builder.buildObject({
        urlset: {
          $: {
            xmlns: "http://www.sitemaps.org/schemas/sitemap/0.9",
          },
          url: newUrls,
        },
      });

      // Create new XML
      const buffer = Buffer.from(newXml);
      const fileData = {
        path: "sitemaps",
        name: "sitemap.xml",
        type: "text/xml",
        size: buffer.length,
        buffer: buffer,
        alternativeText: "Sitemap XML",
        caption: "Generated Sitemap",
      };

      // Delete existing file if it exists
      const existingFiles = await strapi.query("plugin::upload.file").findMany({
        where: {
          name: "sitemap.xml",
          folder: {
            path: "sitemaps",
          },
        },
      });

      if (existingFiles.length > 0) {
        await strapi
          .plugin("upload")
          .service("upload")
          .remove(existingFiles[0]);
      }

      // Upload new file with proper file information
      await strapi
        .plugin("upload")
        .service("upload")
        .upload({
          data: {}, // Contains information like alternativeText
          files: {
            path: fileData.path,
            name: fileData.name,
            type: fileData.type,
            size: fileData.size,
            buffer: fileData.buffer,
          },
        });

      return { success: true };
    } catch (error) {
      console.error("Sitemap generation error:", error);
      throw error;
    }
  },
};
