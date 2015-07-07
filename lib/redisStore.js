var debug = require('debug')('servicebus:retry:RedisStore');
var redis = require('redis');
var util = require('util');

function RedisStore (options) {

  options = options || {};

  if ( ! options.host) throw new Error('a host is required to instantiate a redis store');
  if ( ! options.port) throw new Error('a port is required to instantiate a redis store');

  debug('creating RedisStore with arguments %j', options);

  this.client = redis.createClient(options.port, options.host);

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

module.exports = RedisStore;