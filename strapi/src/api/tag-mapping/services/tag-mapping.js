'use strict';

/**
 * tag-mapping service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::tag-mapping.tag-mapping');
