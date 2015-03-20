DEBUG=servicebus:retry*
REDIS_HOST=localhost
REDIS_PORT=6379

test:
	$(MAKE) DEBUG= test-debug

test-debug:
	DEBUG=$(DEBUG) \
	REDIS_HOST=$(REDIS_HOST) \
	REDIS_PORT=$(REDIS_PORT) \
	./node_modules/.bin/mocha -R spec --recursive

.PHONY: test test-debug