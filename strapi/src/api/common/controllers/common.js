'use strict';

/**
 * common controller
 */

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::common.common');
