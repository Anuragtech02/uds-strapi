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
            "title", // Boost title importance significantly
            // "shortDescription",
          ],
          displayedAttributes: [
            "title",
            "shortDescription",
            "slug",
            "highlightImage",
            "oldPublishedAt",
            // "industries.name",
            // "geographies.name",
          ],
          filterableAttributes: [
            "industries.slug",
            "geographies.slug",
            "oldPublishedAt",
            "publishedAt",
          ],
          sortableAttributes: ["oldPublishedAt", "publishedAt"],
          rankingRules: [
            "words",
            "exactness",
            "typo",
            "proximity",
            "attribute",
            "sort",
          ],
          // distinctAttribute: null,
          typoTolerance: {
            enabled: true,
            minWordSizeForTypos: {
              oneTypo: 5,
              twoTypos: 9,
            },
          },
        },
      },
      blog: {
        settings: {
          searchableAttributes: [
            "title",
            // "shortDescription",
            // "industries.name",
            // "geographies.name",
          ],
          filterableAttributes: [
            "industries.slug",
            "geographies.slug",
            "oldPublishedAt",
            "publishedAt",
          ],
          sortableAttributes: ["oldPublishedAt", "publishedAt"],
          rankingRules: [
            "words",
            "exactness",
            "typo",
            "proximity",
            "attribute",
            "sort",
          ],
          distinctAttribute: null,
          typoTolerance: {
            enabled: true,
            minWordSizeForTypos: {
              oneTypo: 5,
              twoTypos: 9,
            },
          },
        },
        entriesQuery: {
          locale: "en", // Since you only have English content
          populate: {
            industries: {
              fields: ["name", "slug"],
            },
            geographies: {
              fields: ["name", "slug"],
            },
          },
        },
      },
      "news-article": {
        settings: {
          searchableAttributes: [
            "title",
            // "shortDescription",
            // "industries.name",
            // "geographies.name",
          ],
          filterableAttributes: [
            "industries.slug",
            "geographies.slug",
            "oldPublishedAt",
            "publishedAt",
          ],
          sortableAttributes: ["oldPublishedAt", "publishedAt"],
          rankingRules: [
            "words",
            "exactness",
            "typo",
            "proximity",
            "attribute",
            "sort",
          ],
          distinctAttribute: null,
          typoTolerance: {
            enabled: true,
            minWordSizeForTypos: {
              oneTypo: 5,
              twoTypos: 9,
            },
          },
        },
        entriesQuery: {
          locale: "en", // Since you only have English content
          populate: {
            industries: {
              fields: ["name", "slug"],
            },
            geographies: {
              fields: ["name", "slug"],
            },
          },
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
    enabled: false,
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
  email: {
    config: {
      provider: "nodemailer",
      providerOptions: {
        host: env("SMTP_HOST", "titus.protondns.net"),
        port: env("SMTP_PORT", 465),
        secure: false,
        debug: true,
        logger: true,
        auth: {
          user: env("SMTP_USERNAME", "contact@univdatos.com"),
          pass: env("SMTP_PASSWORD", "aL}+v#p5g6*u"),
        },
      },
      settings: {
        defaultFrom: "contact@univdatos.com",
        defaultReplyTo: "contact@univdatos.com",
      },
    },
  },
  "import-export-entries": {
    enabled: true,
    config: {
      enableFilter: true,
      respectPageQueryParameters: true,
      exportOptions: {
        csv: {
          useFieldIds: false,
          exportSelectedOnly: true,
        },
      },
      // Enable for all content types dynamically
      enableAll: true,
    },
  },
});
