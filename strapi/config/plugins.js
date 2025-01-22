module.exports = ({ env }) => ({
  menus: {
    config: {
      maxDepth: 3,
    },
  },
  meilisearch: {
    config: {
      report: {
        settings: {
          searchableAttributes: [
            "title", // highest priority
            "shortDescription", // second priority
            "industries.name",
            "geographies.name",
          ],
          filterableAttributes: [
            "industries.slug",
            "geographies.slug",
            "publishedAt",
            "oldPublishedAt",
          ],
          sortableAttributes: ["publishedAt", "oldPublishedAt"],
          // Optional: You can also set specific weights using ranking rules
          rankingRules: [
            "words",
            "typo",
            "proximity",
            "attribute",
            "sort",
            "exactness",
          ],
          // Optional: Configure word splitting and proximity
          distinctAttribute: null,
          proximityPrecision: "byWord",
        },
      },
      blog: {
        settings: {
          searchableAttributes: [
            "title",
            "shortDescription",
            "industries.name",
            "geographies.name",
          ],
          filterableAttributes: [
            "industries.slug",
            "geographies.slug",
            "publishedAt",
            "oldPublishedAt",
          ],
          sortableAttributes: ["publishedAt", "oldPublishedAt"],
          rankingRules: [
            "words",
            "typo",
            "proximity",
            "attribute",
            "sort",
            "exactness",
          ],
        },
      },
      "news-article": {
        settings: {
          searchableAttributes: [
            "title",
            "shortDescription",
            "industries.name",
            "geographies.name",
          ],
          filterableAttributes: [
            "industries.slug",
            "geographies.slug",
            "publishedAt",
            "oldPublishedAt",
          ],
          sortableAttributes: ["publishedAt", "oldPublishedAt"],
          rankingRules: [
            "words",
            "typo",
            "proximity",
            "attribute",
            "sort",
            "exactness",
          ],
        },
      },
    },
  },
  seo: {
    enabled: true,
  },
  redis: {
    config: {
      connections: {
        default: {
          connection: {
            host: env("REDIS_HOST"),
            port: env("REDIS_PORT", 6379),
            db: 0,
            username: env("REDIS_USERNAME"),
            password: env("REDIS_PASSWORD"),
          },
          settings: {
            debug: false,
          },
        },
      },
    },
  },
  "rest-cache": {
    config: {
      provider: {
        name: "redis",
        options: {
          max: 32767,
          connection: "default",
        },
      },
      strategy: {
        // if you are using keyPrefix for your Redis, please add <keysPrefix>
        keysPrefix: "STRAPI_REDIS",
        contentTypes: [
          "api::report.report",
          "api::blog.blog",
          "api::news-article.news-article",
          "api::industry.industry",
          "api::geography.geography",
          "api::author.author",
          "api::home-page.home-page",
          "api::tag-mapping.tag-mapping",
        ],
      },
    },
  },
  upload: {
    config: {
      provider: "aws-s3",
      providerOptions: {
        baseUrl: env("CDN_URL"),
        rootPath: env("CDN_ROOT_PATH"),
        s3Options: {
          credentials: {
            accessKeyId: env("AWS_ACCESS_KEY_ID"),
            secretAccessKey: env("AWS_ACCESS_SECRET"),
          },
          region: env("AWS_REGION"),
          params: {
            ACL: env("AWS_ACL", "public-read"),
            signedUrlExpires: env("AWS_SIGNED_URL_EXPIRES", 15 * 60),
            Bucket: env("AWS_BUCKET"),
          },
        },
      },
      actionOptions: {
        upload: {},
        uploadStream: {},
        delete: {},
      },
    },
  },
  "generate-data": {
    enabled: true,
  },
  slugify: {
    enabled: false,
    config: {
      contentTypes: {
        blog: {
          field: "slug",
          references: "title",
        },
        report: {
          field: "slug",
          references: "title",
          shouldUpdateSlug: false,
        },
        "news-article": {
          field: "slug",
          references: "title",
        },
      },
    },
  },
  sitemap: {
    enabled: true,
    config: {
      // cron: '0 0 0 * * *',
      limit: 45000,
      xsl: true,
      autoGenerate: true,
      caching: true,
      allowedFields: ["id", "uid", "slug"],
      excludedTypes: [
        "api::order.api",
        "api::order.order",
        "api::payment.api",
        "api::payment.payment",
        "api::header.header",
        "api::header.api",
        "api::footer.footer",
        "api::footer.api",
        "api::sub-industry.sub-industry",
        "api::sub-industry.api",
        "api::product.product",
        "api::product.api",
        "api::user.user",
        "api::user.api",
      ],
    },
  },
});
