var Bluebird = require('bluebird');
var log = require('debug')('servicebus:retry:memory-store');

function MemoryStore () {
  this.store = {};
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

MemoryStore.prototype.hasBeenAcked = async function hasBeenAcked (uniqueId) {
  let promisifiedGet = Bluebird.promisify(this.get)
  let key = await promisifiedGet.call(this, `ack-${uniqueId}`);
  return !!key;
}

MemoryStore.prototype.ack = async function ack (uniqueId, cb) {
  let promisifiedIncrement = Bluebird.promisify(this.increment)
  let value = await promisifiedIncrement.call(this, [`ack-${uniqueId}`, cb])
  return value
}

module.exports = MemoryStore;