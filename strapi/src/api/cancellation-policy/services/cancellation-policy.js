'use strict';

/**
 * cancellation-policy service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::cancellation-policy.cancellation-policy');
