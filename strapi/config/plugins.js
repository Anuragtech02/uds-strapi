module.exports = ({ env }) => ({
  menus: {
    config: {
      maxDepth: 3,
    },
  },
  meilisearch: {
    active: true,
    config: {
      // Your meili host
      host: env("MEILISEARCH_HOST", "http://localhost:7700"),
      // Your master key or private key
      apiKey: env("MEILISEARCH_MASTER_KEY", "STRAPI_UNIVDATOS_SEARCH"),
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
});
