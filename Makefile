DEBUG=servicebus:retry*
REDIS_HOST=localhost
REDIS_PORT=6379

test:
	docker-compose up -d
	sleep 10
	$(MAKE) DEBUG= test-debug
	docker-compose down

test-debug:
	DEBUG=$(DEBUG) \
	REDIS_HOST=$(REDIS_HOST) \
	REDIS_PORT=$(REDIS_PORT) \
	./node_modules/.bin/mocha -R spec --recursive --exit

.PHONY: test test-debug