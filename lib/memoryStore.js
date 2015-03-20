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

module.exports = MemoryStore;