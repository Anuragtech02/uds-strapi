'use strict';

/**
 * geography service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::geography.geography');
