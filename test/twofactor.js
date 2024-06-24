const fetch = require('node-fetch')
	, OTPAuth = require('otpauth')
	, redis = require(__dirname+'/../lib/redis/redis.js')
	, globalSettings = require(__dirname+'/res/globalsettings.js');

module.exports = () => describe('test two factor authentication', () => {

	let sessionCookie
		, csrfToken
		, twofactorSecret
		, twofactorToken;

	test('login as admin without 2fa',  async () => {
		const params = new URLSearchParams();
		params.append('username', 'admin');
		params.append('password', process.env.TEST_ADMIN_PASSWORD);
		const response = await fetch('http://localhost/forms/login', {
			headers: {
				'x-using-xhr': 'true',
			},
			method: 'POST',
			body: params,
			redirect: 'manual',
		});
		const rawHeaders = response.headers.raw();
		expect(rawHeaders['set-cookie']).toBeDefined();
		expect(rawHeaders['set-cookie'][0]).toMatch(/^connect\.sid/);
		sessionCookie = rawHeaders['set-cookie'][0];
		csrfToken = await fetch('http://localhost/csrf.json', { headers: { 'cookie': sessionCookie }})
			.then(res => res.json())
			.then(json => json.token);
	});

	test('check if twofactor setup link is on account page',  async () => {
		const response = await fetch('http://localhost/account.html', {
			headers: {
				'cookie': sessionCookie,
			},
		});
		const text = await response.text();
		expect(text).toContain('<a href="/twofactor.html"');
	});

	test('make sure not force redirected to twofactor page',  async () => {
		const response = await fetch('http://localhost/account.html', {
			headers: {
				'cookie': sessionCookie,
			},
		});
		expect((await response.text())).not.toContain('<span class="code">'); //Note: .not
	});

	test('enable account 2fa enforcement',  async () => {
		const params = new URLSearchParams({
			_csrf: csrfToken,
			...globalSettings,
			// force_action_twofactor: true,
			force_account_twofactor: true
		});
		const response = await fetch('http://localhost/forms/global/settings', {
			headers: {
				'cookie': sessionCookie,
			},
			method: 'POST',
			body: params,
			redirect: 'manual',
		});
		expect(response.status).toBe(200);
	});

	test('make sure force redirected to twofactor page',  async () => {
		const response = await fetch('http://localhost/account.html', {
			headers: {
				'cookie': sessionCookie,
			},
			// redirect: 'manual', //Note: allow to be redirected to /twofactor.html
		});
		expect((await response.text())).toContain('<span class="code">');
	});
	
	test('load twofactor page and fetch secret',  async () => {
		const response = await fetch('http://localhost/twofactor.html', {
			headers: {
				'cookie': sessionCookie,
			},
		});
		const text = await response.text();
		const indexOfSecret = text.indexOf('<span class="code">');
		twofactorSecret = text.substring(indexOfSecret+19, indexOfSecret+19+32);
		twofactorToken = OTPAuth.TOTP.generate({
			algorithm: 'SHA256',
			secret: OTPAuth.Secret.fromBase32(twofactorSecret)
		});
		expect(twofactorToken).toBeDefined();
	});

	test('submit 2fa form to enable 2fa',  async () => {
		const params = new URLSearchParams();
		params.append('_csrf', csrfToken);
		params.append('twofactor', twofactorToken);
		const response = await fetch('http://localhost/forms/twofactor', {
			headers: {
				'x-using-xhr': 'true',
				'cookie': sessionCookie,
			},
			method: 'POST',
			body: params,
			redirect: 'manual',
		});
		expect(response.status).toBe(200);
	});

	test('submit 2fa form again (should be rejected)',  async () => {
		const params = new URLSearchParams();
		params.append('_csrf', csrfToken);
		params.append('twofactor', twofactorToken);
		const response = await fetch('http://localhost/forms/twofactor', {
			headers: {
				'x-using-xhr': 'true',
				'cookie': sessionCookie,
			},
			method: 'POST',
			body: params,
			redirect: 'manual',
		});
		expect(response.status).toBe(403);
	});

	test('login as admin with missing 2fa',  async () => {
		const params = new URLSearchParams();
		params.append('username', 'admin');
		params.append('password', process.env.TEST_ADMIN_PASSWORD);
		params.append('twofactor', '');
		const response = await fetch('http://localhost/forms/login', {
			headers: {
				'x-using-xhr': 'true',
				'cookie': sessionCookie,
			},
			method: 'POST',
			body: params,
			redirect: 'manual',
		});
		expect(response.status).toBe(403);
	});

	test('login as admin with incorrect 2fa',  async () => {
		const params = new URLSearchParams();
		params.append('username', 'admin');
		params.append('password', process.env.TEST_ADMIN_PASSWORD);
		params.append('twofactor', '000000');
		const response = await fetch('http://localhost/forms/login', {
			headers: {
				'x-using-xhr': 'true',
				'cookie': sessionCookie,
			},
			method: 'POST',
			body: params,
			redirect: 'manual',
		});
		expect(response.status).toBe(403);
	});

	test('login as admin with correct 2fa',  async () => {
		await redis.deletePattern('twofactor_success:admin:*'); //delete used 2fa code before trying to login again (same token at this point)
		const params = new URLSearchParams();
		params.append('username', 'admin');
		params.append('password', process.env.TEST_ADMIN_PASSWORD);
		params.append('twofactor', twofactorToken);
		const response = await fetch('http://localhost/forms/login', {
			headers: {
				'x-using-xhr': 'true',
				'cookie': sessionCookie,
			},
			method: 'POST',
			body: params,
			redirect: 'manual',
		});
		const rawHeaders = response.headers.raw();
		expect(rawHeaders['set-cookie']).toBeDefined();
		expect(rawHeaders['set-cookie'][0]).toMatch(/^connect\.sid/);
		// Set updated session cookie and token for 2fa enforcement
		sessionCookie = rawHeaders['set-cookie'][0];
		csrfToken = await fetch('http://localhost/csrf.json', { headers: { 'cookie': sessionCookie }})
			.then(res => res.json())
			.then(json => json.token);
	});

	test('enable action 2fa enforcement',  async () => {
		const params = new URLSearchParams({
			_csrf: csrfToken,
			...globalSettings,
			force_action_twofactor: true,
			// force_account_twofactor: true
		});
		const response = await fetch('http://localhost/forms/global/settings', {
			headers: {
				'cookie': sessionCookie,
			},
			method: 'POST',
			body: params,
			redirect: 'manual',
		});
		expect(response.status).toBe(200);
	});

	test('settings change blocked when missing twofactor in body',  async () => {
		const params = new URLSearchParams({
			_csrf: csrfToken,
			...globalSettings,
			// force_action_twofactor: true,
			// force_account_twofactor: true
		});
		const response = await fetch('http://localhost/forms/global/settings', {
			headers: {
				'cookie': sessionCookie,
			},
			method: 'POST',
			body: params,
			redirect: 'manual',
		});
		console.log((await response.text()));
		expect(response.status).toBe(400);
	});

	test('settings change works with twofactor in body, and disabling 2fa enforcement',  async () => {
		await redis.deletePattern('twofactor_success:admin:*'); //delete used 2fa code before trying to login again (same token at this point)
		const params = new URLSearchParams({
			_csrf: csrfToken,
			...globalSettings,
			// force_action_twofactor: true,
			// force_account_twofactor: true
			twofactor: twofactorToken,
		});
		const response = await fetch('http://localhost/forms/global/settings', {
			headers: {
				'cookie': sessionCookie,
			},
			method: 'POST',
			body: params,
			redirect: 'manual',
		});
		console.log((await response.text()));
		expect(response.status).toBe(200);
	});

	test('login as admin again with correct 2fa (rejected for reuse)',  async () => {
		const params = new URLSearchParams();
		params.append('username', 'admin');
		params.append('password', process.env.TEST_ADMIN_PASSWORD);
		params.append('twofactor', twofactorToken);
		const response = await fetch('http://localhost/forms/login', {
			headers: {
				'x-using-xhr': 'true',
				'cookie': sessionCookie,
			},
			method: 'POST',
			body: params,
			redirect: 'manual',
		});
		expect(response.status).toBe(403);
	});

	test('change admin password with missing 2fa',  async () => {
		const params = new URLSearchParams();
		params.append('username', 'admin');
		params.append('password', process.env.TEST_ADMIN_PASSWORD);
		params.append('newpassword', process.env.TEST_ADMIN_PASSWORD);
		params.append('newpasswordconfirm', process.env.TEST_ADMIN_PASSWORD);
		params.append('twofactor', '');
		const response = await fetch('http://localhost/forms/changepassword', {
			headers: {
				'x-using-xhr': 'true',
				'cookie': sessionCookie,
			},
			method: 'POST',
			body: params,
			redirect: 'manual',
		});
		expect(response.status).toBe(403);
	});

	test('change admin password with incorrect 2fa',  async () => {
		const params = new URLSearchParams();
		params.append('username', 'admin');
		params.append('password', process.env.TEST_ADMIN_PASSWORD);
		params.append('newpassword', process.env.TEST_ADMIN_PASSWORD);
		params.append('newpasswordconfirm', process.env.TEST_ADMIN_PASSWORD);
		params.append('twofactor', '000000');
		const response = await fetch('http://localhost/forms/changepassword', {
			headers: {
				'x-using-xhr': 'true',
				'cookie': sessionCookie,
			},
			method: 'POST',
			body: params,
			redirect: 'manual',
		});
		expect(response.status).toBe(403);
	});

	test('change admin password with correct 2fa',  async () => {
		await redis.deletePattern('twofactor_success:admin:*'); //delete used 2fa code before trying to login again (same token at this point)
		const params = new URLSearchParams();
		params.append('username', 'admin');
		params.append('password', process.env.TEST_ADMIN_PASSWORD);
		params.append('newpassword', process.env.TEST_ADMIN_PASSWORD);
		params.append('newpasswordconfirm', process.env.TEST_ADMIN_PASSWORD);
		params.append('twofactor', twofactorToken);
		params.append('captcha', '000000');
		const response = await fetch('http://localhost/forms/changepassword', {
			headers: {
				'x-using-xhr': 'true',
				'cookie': sessionCookie,
			},
			method: 'POST',
			body: params,
			redirect: 'manual',
		});
		await redis.close();
		expect(response.status).toBe(200);
	});

});
