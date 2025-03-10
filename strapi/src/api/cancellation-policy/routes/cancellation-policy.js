'use strict';

/**
 * cancellation-policy router
 */

const { createCoreRouter } = require('@strapi/strapi').factories;

module.exports = createCoreRouter('api::cancellation-policy.cancellation-policy');
