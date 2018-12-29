var Bluebird = require('bluebird');
var log = require('debug')('servicebus:retry:memory-store');
var { hasBeenAcked, ack } = require('./acks.js');

function MemoryStore () {
  this.store = {};
}

MemoryStore.prototype.clear = function clear (uniqueId, cb) {
  delete this.store[uniqueId];
  cb();
};

let get = function get (uniqueId, cb) {
  cb(null, this.store[uniqueId]);
};

let promisifiedGet = Bluebird.promisify(get)

MemoryStore.prototype.get = get

let increment = function increment (uniqueId, cb) {
  var count = this.store[uniqueId];
  if (count === undefined) {
    count = 1;
  } else {
    count = count + 1;
  }
  this.store[uniqueId] = count;
  cb(null, this.store[uniqueId]);
};

let promisifiedIncrement = Bluebird.promisify(increment)

MemoryStore.prototype.increment = increment

MemoryStore.prototype.hasBeenAcked = function (uniqueId) {
  return hasBeenAcked(this, promisifiedGet)(uniqueId)
}

MemoryStore.prototype.ack = function(uniqueId, cb) {
  return ack(this, promisifiedIncrement)(uniqueId, cb)
}

module.exports = MemoryStore;