var extend = require('extend');
var log = require('debug')('servicebus:retry');
var MemoryStore = require('./lib/memoryStore');
var util = require('util');

module.exports = function (options) {

  options = options || { store: new MemoryStore() };

  options.setRetriesRemaining = options.setRetriesRemaining || false;

  var maxRetries = options.maxRetries || 3;
  var store = options.store;

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

  function getNamespacedUniqueMessageId (uniqueMessageId) {
    return options.namespace !== undefined ? util.format('%s-%s', options.namespace, uniqueMessageId) : uniqueMessageId;
  }

  function setRetriesRemaining (uniqueMessageId, message, cb) {
    if ( ! options.setRetriesRemaining) {
      return cb(null, message);
    } else if (message.fields.redelivered) {
      return store.get(getNamespacedUniqueMessageId(uniqueMessageId), function (err, count) {
        if (err) return cb(err);
        message.content.retriesRemaining = maxRetries - count;
        return cb(null, message);
      });
    } else {
      message.content.retriesRemaining = maxRetries;
      return cb(null, message);
    }
  }

  return {
    handleIncoming: function handleIncoming (channel, msg, options, next) {

      options.ack = options.ack? options.ack : options.acknowledge || false;
      
      if ( ! options || ! options.ack ) return next(null, channel, msg, options);

      var self = this;
      var onlyAckOnce = createOnly('ack', 1);
      var onlyRejectMax = createOnly('reject', maxRetries);
      var uniqueMessageId = msg.content.cid;

      setRetriesRemaining(uniqueMessageId, msg, function (err, message) {
        if (err) {
          self.emit('error', err);
          if (cb) return cb(err);
        }

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

            var namespacedUniqueMessageId = getNamespacedUniqueMessageId(uniqueMessageId);

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

                  var errorQueueName = util.format('%s.error', options.queueName);

                  log('sending message %s to error queue %s', uniqueMessageId, errorQueueName);

                  var buffer = new Buffer(JSON.stringify(message.content));

                  channel.sendToQueue(errorQueueName, buffer, extend(options, { headers: { rejected: count } }));
                  channel.reject(message, false);

                  store.clear(namespacedUniqueMessageId, function (err) {
                    if (err) {
                      self.emit('error', err);
                    }

                    if (cb) return cb(err);
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

        return next(null, channel, message, options);

      });

    }

  };

};

module.exports.MemoryStore = require('./lib/memoryStore');
module.exports.RedisStore = require('./lib/redisStore');
