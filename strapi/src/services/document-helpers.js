function createUniqueDocumentId(item, entityType) {
  // Extract entity type suffix for shorter IDs
  const entitySuffix = entityType.split("::")[1]?.split(".")[0] || "unknown";

  // Create unique ID: {originalId}_{entityType}_{locale}
  return `${item.id}_${entitySuffix}_${item.locale || "en"}`;
}

/**
 * Prepares a Strapi document for Typesense indexing
 * Handles common fields across all content types (reports, blogs, news)
 */
function prepareDocument(item, entityType) {
  // Create base document structure that all content types share
  const doc = {
    id: createUniqueDocumentId(item, entityType),
    originalId: item.id.toString(), // Keep original Strapi ID for frontend
    title: item.title || "",
    shortDescription:
      item.shortDescription || item.excerpt || item.description || "",
    slug: item.slug || "",
    entity: entityType, // e.g., "api::blog.blog", "api::report.report"
    locale: item.locale || "en",
    highlightImage: null,
  };

  // Handle highlight image (could be different field names)
  if (item.highlightImage) {
    if (typeof item.highlightImage === "object" && item.highlightImage.url) {
      doc.highlightImage = {
        url: item.highlightImage.url,
        alternativeText: item.highlightImage.alternativeText || "",
        width: item.highlightImage.width || null,
        height: item.highlightImage.height || null,
      };
    } else if (typeof item.highlightImage === "string") {
      doc.highlightImage = { url: item.highlightImage };
    }
  } else if (item.featuredImage) {
    // Some content might use featuredImage instead
    doc.highlightImage = item.featuredImage;
  }

  // Handle publication dates - try multiple possible field names
  const dateFields = [
    "oldPublishedAt",
    "publishedAt",
    "published_at",
    "publicationDate",
  ];
  for (const field of dateFields) {
    if (item[field]) {
      try {
        doc.oldPublishedAt = new Date(item[field]).getTime(); // Convert to timestamp
        break; // Use the first valid date found
      } catch (dateError) {
        console.warn(
          `Invalid date in field ${field} for item ${item.id}:`,
          item[field]
        );
      }
    }
  }

  // Handle creation date
  if (item.createdAt) {
    try {
      doc.createdAt = new Date(item.createdAt).getTime();
    } catch (dateError) {
      console.warn(`Invalid createdAt for item ${item.id}:`, item.createdAt);
    }
  }

  // Handle industries (could be single or multiple)
  doc.industries = [];
  if (item.industry) {
    // Single industry field
    const industryName =
      typeof item.industry === "string" ? item.industry : item.industry.name;
    if (industryName) {
      doc.industries = [industryName];
    }
  } else if (item.industries && Array.isArray(item.industries)) {
    // Multiple industries field
    doc.industries = item.industries
      .map((industry) =>
        typeof industry === "string" ? industry : industry.name
      )
      .filter(Boolean); // Remove any null/undefined values
  }

  // Handle geographies (mainly for reports)
  doc.geographies = [];
  if (item.geographies && Array.isArray(item.geographies)) {
    doc.geographies = item.geographies
      .map((geography) =>
        typeof geography === "string" ? geography : geography.name
      )
      .filter(Boolean);
  } else if (item.geography) {
    // Single geography field
    const geographyName =
      typeof item.geography === "string" ? item.geography : item.geography.name;
    if (geographyName) {
      doc.geographies = [geographyName];
    }
  }

  return doc;
}

// FIXED: Date handling in prepareDocumentWithMedia function
function prepareDocumentWithMedia(item, entityType) {
  // Create base document structure
  const doc = {
    id: createUniqueDocumentId(item, entityType),
    originalId: item.id.toString(),
    title: item.title || "",
    shortDescription: item.shortDescription || "",
    slug: item.slug || "",
    entity: entityType,
    locale: item.locale || "en",
    highlightImage: null,
  };

  // Handle highlightImage for reports only (your existing logic)
  if (entityType === "api::report.report" && item.highlightImage) {
    try {
      let imageUrl = null;
      if (
        typeof item.highlightImage === "object" &&
        item.highlightImage !== null
      ) {
        if (item.highlightImage.url) {
          imageUrl = item.highlightImage.url;
        } else if (item.highlightImage.data?.attributes?.url) {
          imageUrl = item.highlightImage.data.attributes.url;
        } else if (
          Array.isArray(item.highlightImage) &&
          item.highlightImage[0]?.url
        ) {
          imageUrl = item.highlightImage[0].url;
        }
      } else if (typeof item.highlightImage === "string") {
        imageUrl = item.highlightImage;
      }

      if (imageUrl && typeof imageUrl === "string" && imageUrl.trim()) {
        doc.highlightImage = imageUrl.trim();
      } else {
        doc.highlightImage = null;
      }
    } catch (imageError) {
      console.warn(
        `⚠️ Error processing highlightImage for report ${item.id}:`,
        imageError.message
      );
      doc.highlightImage = null;
    }
  } else {
    doc.highlightImage = null;
  }

  // FIXED: Publication date handling with consistent timestamp conversion
  const dateFields = ["oldPublishedAt", "publishedAt", "published_at"];
  let foundValidDate = false;

  for (const field of dateFields) {
    if (item[field] && !foundValidDate) {
      try {
        let timestamp;
        const dateValue = item[field];

        if (typeof dateValue === "string") {
          // Parse string date to timestamp
          const parsedDate = new Date(dateValue);
          if (!isNaN(parsedDate.getTime())) {
            timestamp = parsedDate.getTime();
          }
        } else if (typeof dateValue === "number") {
          // Already a timestamp, but validate it
          if (dateValue > 0) {
            timestamp = dateValue;
          }
        } else if (dateValue instanceof Date) {
          // Date object
          timestamp = dateValue.getTime();
        }

        if (timestamp && timestamp > 0) {
          doc.oldPublishedAt = timestamp; // Always store as number (timestamp)
          foundValidDate = true;

          // Debug log to verify date conversion
          console.log(
            `📅 ${entityType} ${
              item.id
            }: ${field} = ${dateValue} -> ${timestamp} (${new Date(
              timestamp
            ).toISOString()})`
          );
          break;
        }
      } catch (dateError) {
        console.warn(
          `⚠️ Invalid date in field ${field} for item ${item.id}:`,
          dateError.message
        );
      }
    }
  }

  if (!foundValidDate) {
    console.warn(
      `⚠️ No valid publication date found for ${entityType} ${item.id}`
    );
    // Use creation date as fallback or current time
    if (item.createdAt) {
      try {
        const createdTimestamp = new Date(item.createdAt).getTime();
        doc.oldPublishedAt = createdTimestamp;
        console.log(
          `📅 Using createdAt as fallback for ${entityType} ${item.id}`
        );
      } catch (createdError) {
        doc.oldPublishedAt = Date.now(); // Last resort: current time
        console.warn(
          `⚠️ Using current time as fallback for ${entityType} ${item.id}`
        );
      }
    } else {
      doc.oldPublishedAt = Date.now();
    }
  }

  // FIXED: Creation date handling
  if (item.createdAt) {
    try {
      const createdTimestamp = new Date(item.createdAt).getTime();
      if (!isNaN(createdTimestamp)) {
        doc.createdAt = createdTimestamp; // Always store as number (timestamp)
      }
    } catch (dateError) {
      console.warn(
        `⚠️ Invalid createdAt for item ${item.id}:`,
        dateError.message
      );
    }
  }

  // Handle industries and geographies (your existing logic)
  doc.industries = [];
  try {
    if (item.industry) {
      const industryName =
        typeof item.industry === "string" ? item.industry : item.industry.name;
      if (industryName) {
        doc.industries = [industryName];
      }
    } else if (item.industries && Array.isArray(item.industries)) {
      doc.industries = item.industries
        .map((industry) =>
          typeof industry === "string" ? industry : industry.name
        )
        .filter(Boolean);
    }
  } catch (industryError) {
    console.warn(
      `⚠️ Error processing industries for ${entityType} ${item.id}:`,
      industryError.message
    );
    doc.industries = [];
  }

  doc.geographies = [];
  try {
    if (entityType === "api::report.report" && item.geography) {
      const geographyName =
        typeof item.geography === "string"
          ? item.geography
          : item.geography.name;
      if (geographyName) {
        doc.geographies = [geographyName];
      }
    }
  } catch (geographyError) {
    console.warn(
      `⚠️ Error processing geographies for ${entityType} ${item.id}:`,
      geographyError.message
    );
    doc.geographies = [];
  }

  return doc;
}

/**
 * Specialized function for preparing blog documents
 * Handles blog-specific fields and fallbacks
 */
function prepareBlogDocument(blog) {
  const baseDoc = prepareDocument(blog, "api::blog.blog");

  // Blog-specific handling

  // Blogs might not have shortDescription, use title as fallback
  if (!baseDoc.shortDescription && baseDoc.title) {
    baseDoc.shortDescription = baseDoc.title;
  }

  // Blogs typically don't have geographies
  baseDoc.geographies = [];

  // Handle blog-specific fields
  if (blog.content) {
    // If you want to include content in search, you might want to truncate it
    // baseDoc.content = blog.content.substring(0, 500); // First 500 chars
  }

  if (blog.author) {
    baseDoc.author =
      typeof blog.author === "string"
        ? blog.author
        : blog.author.name || blog.author.username;
  }

  if (blog.tags && Array.isArray(blog.tags)) {
    baseDoc.tags = blog.tags
      .map((tag) => (typeof tag === "string" ? tag : tag.name))
      .filter(Boolean);
  }

  return baseDoc;
}

/**
 * Specialized function for preparing report documents
 */
function prepareReportDocument(report) {
  const baseDoc = prepareDocument(report, "api::report.report");

  // Report-specific handling

  // Reports should have both industries and geographies
  // This is already handled in the base prepareDocument function

  // Handle report-specific fields
  if (report.reportType) {
    baseDoc.reportType =
      typeof report.reportType === "string"
        ? report.reportType
        : report.reportType.name;
  }

  if (report.pages) {
    baseDoc.pages = parseInt(report.pages, 10) || null;
  }

  if (report.price) {
    baseDoc.price = parseFloat(report.price) || null;
  }

  return baseDoc;
}

/**
 * Specialized function for preparing news article documents
 */
function prepareNewsDocument(news) {
  const baseDoc = prepareDocument(news, "api::news-article.news-article");

  // News-specific handling

  // News articles might have different field names
  if (!baseDoc.shortDescription) {
    baseDoc.shortDescription =
      news.summary || news.lead || news.excerpt || baseDoc.title;
  }

  // News typically don't have geographies but might have industries
  baseDoc.geographies = [];

  // Handle news-specific fields
  if (news.source) {
    baseDoc.source =
      typeof news.source === "string" ? news.source : news.source.name;
  }

  if (news.category) {
    baseDoc.category =
      typeof news.category === "string" ? news.category : news.category.name;
  }

  return baseDoc;
}

/**
 * Main function to prepare any document for indexing
 * Automatically detects the content type and uses the appropriate preparation function
 */
function prepareDocumentForIndexing(item, entityType) {
  switch (entityType) {
    case "api::blog.blog":
      return prepareBlogDocument(item);
    case "api::report.report":
      return prepareReportDocument(item);
    case "api::news-article.news-article":
      return prepareNewsDocument(item);
    default:
      return prepareDocument(item, entityType);
  }
}

// Export the functions
module.exports = {
  prepareDocument,
  prepareBlogDocument,
  prepareReportDocument,
  prepareNewsDocument,
  prepareDocumentForIndexing,
  prepareDocumentWithMedia,
  createUniqueDocumentId,
};
