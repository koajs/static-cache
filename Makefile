test:
	@NODE_ENV=test ./node_modules/.bin/mocha \
		--require should \
		--require should-http \
		--harmony \
		--reporter spec \
		--bail

test-cov:
	@NODE_ENV=test node --harmony \
		node_modules/.bin/istanbul cover \
		./node_modules/.bin/_mocha \
		-- -u exports \
		--require should \
		--require should-http \
		--reporter spec \
		--bail

test-travis:
	@NODE_ENV=test node --harmony \
		node_modules/.bin/istanbul cover \
		./node_modules/.bin/_mocha \
		--report lcovonly \
		-- -u exports \
		--require should \
		--require should-http \
		--reporter spec \
		--bail

clean:
	@rm -rf node_modules

.PHONY: test clean
