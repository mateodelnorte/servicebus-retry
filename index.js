var extend = require('extend');
var log = require('debug')('servicebus:retry');
var MemoryStore = require('./lib/memoryStore');
var util = require('util');

var maxRetries = 3;
var namespace;

var methodMax = {};

function createOnly (method, max) {
  var calledByMethod = {};
  methodMax[method] = max;
  return function only (message) {
    if (calledByMethod[method] === undefined) {
      calledByMethod[method] = 1;
    } else {
      calledByMethod[method]++;
    }
    if (Object.keys(calledByMethod).length && calledByMethod[method] > methodMax[method]) {
      var methods = Object.keys(calledByMethod).join(',');
      throw new Error(util.format('message type: %s cid: %s handle already called with %s', message.content.type, message.content.cid, methods));
    }
  };
}

module.exports = function (options) {

  options = options || { store: new MemoryStore() };

  if (options.maxRetries) maxRetries = options.maxRetries;
  if (options.namespace) namespace = options.namespace;

  var store = options.store;

  return {
    handleIncoming: function handleIncoming (channel, message, options, next) {

      var self = this;

      var onlyAckOnce = createOnly('ack', 1);
      var onlyRejectMax = createOnly('reject', maxRetries);

      if (options && options.ack) {

        var uniqueMessageId = message.content.cid;

        message.content.handle = {
          ack: function ack (cb) {
            onlyAckOnce(message);

            log('acking message %s', uniqueMessageId);

            channel.ack(message);

            if (cb) return cb();
          },
          acknowledge: function acknowledge (cb) {
            ack(cb);
          },
          reject: function reject (cb) {
            onlyRejectMax(message);

            var namespacedUniqueMessageId = namespace !== undefined ? util.format('%s-%s', namespace, uniqueMessageId) : uniqueMessageId;

            store.increment(namespacedUniqueMessageId, function (err) {
              if (err) {
                self.emit('error', err);
                if (cb) return cb(err);
              }

              store.get(namespacedUniqueMessageId, function (err, count) {
                if (err) {
                  self.emit('error', err);
                  if (cb) return cb(err);
                }

                if (count > maxRetries) {

                  var errorQueueName = util.format('%s.error', message.fields.routingKey);

                  log('sending message %s to error queue %s', uniqueMessageId, errorQueueName);

                  var buffer = new Buffer(JSON.stringify(message.content));

                  channel.sendToQueue(errorQueueName, buffer, extend(options, { headers: { rejected: count } }));
                  channel.reject(message, false);

                  store.clear(namespacedUniqueMessageId, function (err) {
                    if (err) {
                      self.emit('error', err);
                      if (cb) return cb(err);
                    }
                  });

                } else {

                  log('retrying message %s', uniqueMessageId);

                  channel.reject(message, true);

                  if (cb) return cb();

                }

              });

            });

          }
        };
      }

      next(null, channel, message, options);
    }
  };

};

module.exports.MemoryStore = require('./lib/memoryStore');
module.exports.RedisStore = require('./lib/redisStore');
