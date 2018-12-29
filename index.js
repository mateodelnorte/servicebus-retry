var extend = require('extend');
var log = require('debug')('servicebus:retry');
var MemoryStore = require('./lib/memoryStore');
var util = require('util');

module.exports = function (options = {}) {

  options.store = options.store || new MemoryStore()
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

  async function setRetriesRemaining (uniqueMessageId, message, cb) {
    log('setting remaining retries for ', uniqueMessageId, message)
    if ( ! options.setRetriesRemaining) {
      return cb(null, message);
    } else if (message.fields && message.fields.redelivered) {
      // rabbitmq
      return store.get(getNamespacedUniqueMessageId(uniqueMessageId), function (err, count) {
        if (err) return cb(err);
        message.content.retriesRemaining = maxRetries - count;
        return cb(null, message);
      });
    } else if ( message.offset ) {
      // log('kafka detected!')
      const namespacedUniqueMessageId = getNamespacedUniqueMessageId(uniqueMessageId);

      if (await store.hasBeenAcked(namespacedUniqueMessageId)) {
        log('this message has already been processed')
        message.hasBeenAcked = true
        return cb(null, message)
      }

      return store.get(namespacedUniqueMessageId, function (err, count) {
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
      if ( ! options || ! options.ack ) return next(null, channel, msg, options);

      log('handling incoming message')

      var self = this;
      var onlyAckOnce = createOnly('ack', 1);
      var onlyRejectMax = createOnly('reject', maxRetries);
      var uniqueMessageId = msg.content.cid;

      setRetriesRemaining(uniqueMessageId, msg, function (err, message) {
        if (err) {
          self.emit('error', err);
          if (cb) return cb(err);
        }

        if (message.hasBeenAcked) {
          log('message has been acked before, skipping')
          return;
        }

        log('processing message')

        message.content.handle = {
          ack: async function ack (cb) {
            onlyAckOnce(message);

            log('acking message %s', uniqueMessageId);

            // kafka uses confirms in batches
            // so we'll handle not reprocessing
            // messages for kafka by keeping track
            // of which messages have alredy been acked.
            //
            // In rabbitmq, this removes the message from the
            // queue, preventing reprocessing, using channel.ack
            if (channel.ack) {
              channel.ack(message);
            } else {
              return await store.ack(getNamespacedUniqueMessageId(uniqueMessageId), cb);
            }

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
