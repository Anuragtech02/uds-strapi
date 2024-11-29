'use strict';

/**
 * disclaimer service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::disclaimer.disclaimer');
