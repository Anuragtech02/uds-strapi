'use strict';

/**
 * common service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::common.common');
