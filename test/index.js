var noop = function () {};
var log = require('debug')('servicebus:test');
var retry = require('../index');
var should = require('should');
var util = require('util');

describe('retry', function() {

  describe('MemoryStore', function () {

    var bus = require('servicebus').bus();
    bus.use(bus.correlate());
    bus.use(retry());

    it('should throw if ack called more than once on message', function () {
      var channel = {
        ack: function () {},
        publish: function () {}
      };
      var message = {
        content: {
          cid: 1
        },
        fields: {},
        properties: {
          headers: {}
        }
      };
      var middleware = retry().handleIncoming;
      middleware(channel, message, { ack: true }, function (err, channel, message, options, next) {
        message.content.handle.ack();
        (function () {
          message.content.handle.ack();
        }).should.throw(Error);
      });
    });

    it('should throw if reject called more than max on message', function () {
      var channel = {
        reject: function () {},
        publish: function () {}
      };
      var message = {
        content: {
          cid: 1
        },
        fields: {
          redelivered: false
        },
        properties: {
          headers: {}
        }
      };
      var middleware = retry().handleIncoming;
      middleware(channel, message, { ack: true, maxRetries: 3 }, function (err, channel, message, options, next) {
        message.content.handle.reject();
        message.content.handle.reject();
        message.content.handle.reject();
        (function () {
          message.content.handle.reject();
        }).should.throw(Error);
      });
    });

    it('rejected send/listen messages should retry until max retries', function (done) {
      var count = 0;
      bus.listen('test.servicebus.retry.1', { ack: true }, function (event) {
        count++;
        event.handle.reject();
      });
      bus.listen('test.servicebus.retry.1.error', { ack: true }, function (event) {
        count.should.equal(4); // one send and three retries
        event.handle.ack();
        bus.destroyListener('test.servicebus.retry.1').on('success', function () {
          bus.destroyListener('test.servicebus.retry.1.error').on('success', function () {
            done();
          });
        });
      });
      setTimeout(function () {
        bus.send('test.servicebus.retry.1', { my: 'event' });
      }, 100);
    });

    it('rejected publish/subscribe messages should retry until max retries', function (done){
      var count = 0;
      var subscription = bus.subscribe('test.servicebus.retry.2', { ack: true }, function (event) {
        count++;
        event.handle.reject();
      });
      bus.listen('test.servicebus.retry.2.error', { ack: true }, function (event) {
        count.should.equal(4); // one send and three retries
        event.handle.ack();
        // subscription.unsubscribe(function () {
          bus.destroyListener('test.servicebus.retry.2.error').on('success', function () {
            done();
          });
        // });
      });
      setTimeout(function () {
        bus.publish('test.servicebus.retry.2', { data: Math.random() });
      }, 1000);
    });

  });

  describe('RedisStore', function () {

    var store = new retry.RedisStore({
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT
    });

    var bus = require('servicebus').bus();
    bus.use(bus.correlate());
    bus.use(retry({
      namespace: 'namespace',
      store: store
    }));

    it('should throw if ack called more than once on message', function () {
      var channel = {
        ack: function () {},
        publish: function () {}
      };
      var message = {
        content: {
          cid: 1
        },
        fields: {},
        properties: {
          headers: {}
        }
      };
      var middleware = retry().handleIncoming;
      middleware(channel, message, { ack: true }, function (err, channel, message, options, next) {
        message.content.handle.ack();
        (function () {
          message.content.handle.ack();
        }).should.throw(Error);
      });
    });

    it('should throw if reject called more than max on message', function () {
      var channel = {
        reject: function () {},
        publish: function () {}
      };
      var message = {
        content: {
          cid: 1
        },
        fields: {},
        properties: {
          headers: {}
        }
      };
      var middleware = retry().handleIncoming;
      middleware(channel, message, { ack: true, maxRetries: 3 }, function (err, channel, message, options, next) {
        message.content.handle.reject();
        message.content.handle.reject();
        message.content.handle.reject();
        (function () {
          message.content.handle.reject();
        }).should.throw(Error);
      });
    });

    it('rejected send/listen messages should retry until max retries', function (done) {
      var count = 0;
      bus.listen('test.servicebus.retry.3', { ack: true }, function (event) {
        count++;
        event.handle.reject();
      });
      bus.listen('test.servicebus.retry.3.error', { ack: true }, function (event) {
        count.should.equal(4); // one send and three retries
        event.handle.ack();
        bus.destroyListener('test.servicebus.retry.3').on('success', function () {
          bus.destroyListener('test.servicebus.retry.3.error').on('success', function () {
            done();
          });
        });
      });
      setTimeout(function () {
        bus.send('test.servicebus.retry.3', { my: 'event' });
      }, 100);
    });

    it('rejected publish/subscribe messages should retry until max retries', function (done){
      var count = 0;
      var subscription = bus.subscribe('test.servicebus.retry.4', { ack: true }, function (event) {
        count++;
        event.handle.reject();
      });
      bus.listen('test.servicebus.retry.4.error', { ack: true }, function (event) {
        count.should.equal(4); // one send and three retries
        event.handle.ack();
        // subscription.unsubscribe(function () {
          bus.destroyListener('test.servicebus.retry.4.error').on('success', function () {
            done();
          });
        // });
      });
      setTimeout(function () {
        bus.publish('test.servicebus.retry.4', { data: Math.random() });
      }, 100);
    });

    it('rejected wildcard subscribe messages should retry until max retries', function (done){
      var count = 0;
      var subscription = bus.subscribe('test.servicebus.retry.wildcard.*', { ack: true }, function (event) {
        count++;
        event.handle.reject();
      });
      bus.listen('test.servicebus.retry.wildcard.*.error', { ack: true }, function (event) {
        count.should.equal(4); // one send and three retries
        event.handle.ack();
        // subscription.unsubscribe(function () {
          bus.destroyListener('test.servicebus.retry.wildcard.*.error').on('success', function () {
            done();
          });
        // });
      });
      setTimeout(function () {
        bus.publish('test.servicebus.retry.wildcard.5', { data: Math.random() });
      }, 100);
    });

  });

  describe('options', function () {

    describe('namespace', function () {

      var store = new retry.RedisStore({
        host: process.env.REDIS_HOST,
        port: process.env.REDIS_PORT
      });

      var bus = require('servicebus').bus();
      bus.use(bus.correlate());
      bus.use(retry({
        namespace: 'namespace',
        store: store
      }));

      it('should prepend unique message id with provided namespace', function (done) {

        var count = 0;

        bus.listen('test.servicebus.retry.5.error', { ack: true }, function (event) {
        });

        bus.listen('test.servicebus.retry.5', { ack: true }, function (event) {
          count++;

          if (count === 4) {
            var key = util.format('%s-%s', 'namespace', event.cid);
            store.get(key, function (err, rejectCount) {
              if (err) return done(err);
              Number(rejectCount).should.eql(count - 1);
              store.clear(key, function (err) {
                if (err) return done(err);
                bus.destroyListener('test.servicebus.retry.5', { force: true }).on('success', function () {
                  bus.destroyListener('test.servicebus.retry.5.error', { force: true }).on('success', function () {
                    done();
                  });
                });
              });
            });
          }

          event.handle.reject(function (err) {
            if (err) return done(err);
          });

        });

        setTimeout(function () {
          bus.send('test.servicebus.retry.5', { my: 'event' });
        }, 100);

      });

    })

    describe('setRetriesRemaining', function () {

      it('should provide count of retries remaining', function (done) {

        var maxRetries = 5;

        var store = new retry.RedisStore({
          host: process.env.REDIS_HOST,
          port: process.env.REDIS_PORT
        });

        var bus = require('servicebus').bus();
        bus.use(bus.correlate());
        bus.use(retry({
          maxRetries: maxRetries,
          namespace: 'namespace',
          setRetriesRemaining: true,
          store: store
        }));
        bus.use(bus.package());

        var count = 0;

        bus.listen('test.servicebus.retry.6', { ack: true }, function (event) {
          count++;

          Number(count).should.eql(maxRetries - event.retriesRemaining + 1);

          if (event.retriesRemaining === 0) {

            bus.destroyListener('test.servicebus.retry.6', { force: true }).on('success', function () {
              bus.destroyListener('test.servicebus.retry.6.error', { force: true }).on('success', function () {
                done();
              });
            });

          }

          event.handle.reject(function (err) {
            if (err) return done(err);
          });

        });

        bus.listen('test.servicebus.retry.6.error', { ack: true }, function (event) {
        });

        setTimeout(function () {
          bus.send('test.servicebus.retry.6', { my: 'event' }, { ack: true });
        }, 100);

      });

    });

  });

});
