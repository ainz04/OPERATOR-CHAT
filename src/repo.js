'use strict';
/**
 * Data-access layer aggregator.
 */
module.exports = {
  users: require('./repo/users'),
  grants: require('./repo/grants'),
  messages: require('./repo/messages'),
  logs: require('./repo/logs'),
};
