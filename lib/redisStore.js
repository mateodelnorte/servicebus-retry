var Bluebird = require('bluebird');
var debug = require('debug')('servicebus:retry:RedisStore');
var redis = require('redis');
var util = require('util');

// NOTE: When using with Kafka, you should set `keyExpireTTL` to 0
// as redis is helping prevent messages from being replayed when received in a batch
// that has been partially processed
function RedisStore (options) {

  options = options || {};

  if ( ! options.host) throw new Error('a host is required to instantiate a redis store');
  if ( ! options.port) throw new Error('a port is required to instantiate a redis store');

  debug('creating RedisStore with arguments %j', options);

  var extraOptions = options.password ? { password: options.password } : null

  this.client = redis.createClient(options.port, options.host, extraOptions);

  this.keyFormat = options.keyFormat || 'servicebus.retry.%s';
  this.keyExpireTTL = options.keyExpireTTL || options.ttl || 30;
}

RedisStore.prototype.clear = function clear (uniqueId, cb) {
  debug('clearing %s', uniqueId);
  this.client.del(util.format(this.keyFormat, uniqueId), cb);
};

RedisStore.prototype.get = function get (uniqueId, cb) {
  debug('getting %s', uniqueId);
  this.client.get(util.format(this.keyFormat, uniqueId), cb);
};

RedisStore.prototype.increment = function increment (uniqueId, cb) {

  debug('incrementing %s', uniqueId);

  var multi = this.client.multi();
  var key = util.format(this.keyFormat, uniqueId);

  multi.incr(key);
  multi.expire(key, this.keyExpireTTL);

  multi.exec(function (err) {
    cb(err);
  });

};

RedisStore.prototype.hasBeenAcked = async function hasBeenAcked (uniqueId) {
  let promisifiedGet = Bluebird.promisify(this.get)
  let key = await promisifiedGet.call(this, `ack-${uniqueId}`);
  return !!key;
}

RedisStore.prototype.ack = async function ack (uniqueId, cb) {
  let promisifiedIncrement = Bluebird.promisify(this.increment)
  let value = await promisifiedIncrement.call(this, [`ack-${uniqueId}`, cb])
  return value
}

module.exports = RedisStore;