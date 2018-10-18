var log = require('debug')('servicebus:retry:memory-store');

function MemoryStore () {
  this.store = {};
  this.acks = {};
}

MemoryStore.prototype.clear = function clear (uniqueId, cb) {
  delete this.store[uniqueId];
  cb();
};

MemoryStore.prototype.get = function get (uniqueId, cb) {
  cb(null, this.store[uniqueId]);
};

MemoryStore.prototype.increment = function increment (uniqueId, cb) {
  var count = this.store[uniqueId];
  if (count === undefined) {
    count = 1;
  } else {
    count = count + 1;
  }
  this.store[uniqueId] = count;
  cb(null, this.store[uniqueId]);
};

MemoryStore.prototype.hasBeenAcked = function hasBeenAcked (uniqueId, cb) {
  log(`checking if ${uniqueId} has been acked`, !!this.acks[uniqueId])
  return !! this.acks[uniqueId]
}

MemoryStore.prototype.ack = function ack (uniqueId, cb) {
  this.acks[uniqueId] = true
}

module.exports = MemoryStore;