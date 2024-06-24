/* eslint-disable indent */
/* eslint-disable no-undef */
'use strict';

const Redis = require('ioredis'),
	{ redis, debugLogs } = require(__dirname+'/../../configs/secrets.js');

function logRedisError(error, context = '') {
	console.error(`Redis error${context ? ' in ' + context : ''}:`, error);
}

// Set up the shared Redis client with improved retry and reconnect strategies
const sharedClient = new Redis({
	host: redis.host,
	port: Number(redis.port || 6379),
	username: redis.username,
	password: redis.password,
	retryStrategy: function(times) {
		// attempt to reconnect after increasing delays, with a maximum delay of 2000ms
		const delay = Math.min(Math.pow(times, 2) * 50, 2000);
		debugLogs && console.log(`Retrying Redis connection in ${delay}ms...`);
		return delay;
	},
	maxRetriesPerRequest: null,
	connectTimeout: 10000, // 10 seconds connection timeout
	reconnectOnError: (err) => {
		const targetErrors = [
			'READONLY',
			'ETIMEDOUT',
			'ECONNREFUSED',
			'ECONNRESET',
			'EHOSTUNREACH'
		];
		if (targetErrors.some(error => err.message.includes(error))) {
			debugLogs && console.log(`Reconnecting due to error: ${err.message}`);
			return true;
		}
	}
});

// Event listeners for the shared Redis client
sharedClient.on('connect', () => debugLogs && console.log('Connected to Redis'));
sharedClient.on('error', (err) => logRedisError(err, 'sharedClient'));
sharedClient.on('reconnecting', (delay) => debugLogs && console.log(`Redis reconnecting in ${delay}ms`));

// Duplicate shared client for publisher and subscriber roles
const subscriber = sharedClient.duplicate();
const publisher = sharedClient.duplicate();

// Define message callback object
const messageCallbacks = {
	'config': [],
	'roles': [],
};

module.exports = {
	redisClient: sharedClient,
	redisSubscriber: subscriber,
	redisPublisher: publisher,

	close: () => {
		sharedClient.quit();
		publisher.quit();
		subscriber.quit();
	},

	addCallback: (channel, cb) => {
		if (messageCallbacks[channel].length === 0) {
			subscriber.subscribe('config', (err) => {
				if (err) {
					return logRedisError(err, 'subscribe config');
				}
			});
			subscriber.subscribe('roles', (err) => {
				if (err) {
					return logRedisError(err, 'subscribe roles');
				}
			});
			subscriber.on('message', (channel, message) => {
				debugLogs && console.log(`Subscriber message from channel ${channel}`);
				let data;
				if (message) {
					data = JSON.parse(message);
				}
				messageCallbacks[channel].forEach(cb => {
					cb(data);
				});
			});
		}
		messageCallbacks[channel].push(cb);
	},

	// Get a value with key
	get: (key) => {
		return sharedClient.get(key).then(res => {
			return JSON.parse(res);
		});
	},

	// Set a value on key
	set: (key, value, ttl) => {
		if (ttl) {
			return sharedClient.set(key, JSON.stringify(value), 'EX', ttl);
		} else {
			return sharedClient.set(key, JSON.stringify(value));
		}
	},

	incr: (key) => {
		return sharedClient.incr(key);
	},

	expire: (key, ttl) => {
		return sharedClient.expire(key, ttl);
	},

	// Set a value on key if not exist
	setnx: (key, value) => {
		return sharedClient.setnx(key, JSON.stringify(value));
	},

	// Add items to a set
	sadd: (key, value) => {
		return sharedClient.sadd(key, value);
	},

	// Get all members of a set
	sgetall: (key) => {
		return sharedClient.smembers(key);
	},

	// Remove item from a set
	srem: (key, values) => {
		return sharedClient.srem(key, values);
	},

	// Get random item from the set
	srand: (key) => {
		return sharedClient.srandmember(key);
	},

	// Delete value with key
	del: (keyOrKeys) => {
		debugLogs && console.log('redis del():', keyOrKeys);
		if (Array.isArray(keyOrKeys)) {
			return sharedClient.del(...keyOrKeys);
		} else {
			return sharedClient.del(keyOrKeys);
		}
	},

	getPattern: (pattern) => {
		return new Promise((resolve, reject) => {
			const stream = sharedClient.scanStream({
				match: pattern
			});
			let allKeys = [];
			stream.on('data', (keys) => {
				allKeys = allKeys.concat(keys);
			});
			stream.on('end', async () => {
				const pipeline = sharedClient.pipeline();
				for (let i = 0; i < allKeys.length; i++) {
					pipeline.get(allKeys[i]);
				}
				let results;
				try {
					results = await pipeline.exec();
				} catch (e) {
					return reject(e);
				}
				const data = {};
				for (let i = 0; i < results.length; i++) {
					data[allKeys[i]] = JSON.parse(results[i][1]);
				}
				resolve(data);
			});
			stream.on('error', (err) => {
				reject(err);
			});
		});
	},

	deletePattern: (pattern) => {
		return new Promise((resolve, reject) => {
			let totalDeleted = 0;
			const stream = sharedClient.scanStream({
				match: pattern
			});
			stream.on('data', (keys) => {
				if (keys.length > 0) {
					totalDeleted += keys.length;
					const pipeline = sharedClient.pipeline();
					for (let i = 0; i < keys.length; i++) {
						pipeline.del(keys[i]);
					}
					pipeline.exec();
				}
			});
			stream.on('end', () => {
				resolve(totalDeleted);
			});
			stream.on('error', (err) => {
				reject(err);
			});
		});
	},
};
