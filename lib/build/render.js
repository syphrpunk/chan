/* eslint-disable no-undef */
'use strict';

const { outputFile } = require('fs-extra')
	, formatSize = require(__dirname+'/../converter/formatsize.js')
	, pug = require('pug')
	, path = require('path')
	// , commit = require(__dirname+'/../misc/commit.js')
	, uploadDirectory = require(__dirname+'/../file/uploaddirectory.js')
	, { yandex, hcaptcha, google } = require(__dirname+'/../../configs/secrets.js')
	, redlock = require(__dirname+'/../redis/redlock.js')
	, { addCallback } = require(__dirname+'/../redis/redis.js')
	, { version } = require(__dirname+'/../../package.json')
	, templateDirectory = path.join(__dirname+'/../../views/pages/')
	, { Permissions } = require(__dirname+'/../permission/permissions.js')
	, i18n = require(__dirname+'/../locale/locale.js')
	, config = require(__dirname+'/../../lib/misc/config.js');

let { language, archiveLinksURL, ethereumLinksURL, lockWait, globalLimits, boardDefaults, cacheTemplates,
		reverseImageLinksURL, meta, enableWebring, captchaOptions, globalAnnouncement, enableWeb3 } = config.get
	, renderLocals = null;

const updateLocals = () => {
	({ language, archiveLinksURL, ethereumLinksURL, lockWait, globalLimits, boardDefaults, cacheTemplates,
		reverseImageLinksURL, meta, enableWebring, captchaOptions, globalAnnouncement, enableWeb3 } = config.get);
	renderLocals = {
		Permissions,
		cache: cacheTemplates,
		ethereumLinksURL,
		archiveLinksURL,
		reverseImageLinksURL,
		meta,
		// eslint-disable-next-line no-undef
		// commit,
		version,
		enableWeb3,
		defaultTheme: boardDefaults.theme,
		defaultCodeTheme: boardDefaults.codeTheme,
		postFilesSize: formatSize(globalLimits.postFilesSize.max),
		globalLimits,
		enableWebring,
		googleRecaptchaSiteKey: google ? google.siteKey : '',
		hcaptchaSiteKey: hcaptcha ? hcaptcha.siteKey : '',
		yandexSiteKey: yandex ? yandex.siteKey : '',
		captchaOptions,
		globalAnnouncement,
		globalLanguage: language,
	};
	i18n.init(renderLocals);
	renderLocals.setLocale(renderLocals, language);
};

updateLocals();
addCallback('config', updateLocals);

module.exports = async (htmlName=null, templateName=null, options=null, json=null) => {

	//generate html if applicable
	let html = null;
	if (templateName !== null) {
		const mergedLocals = {
			...options,
			...renderLocals,
		};
		//NOTE: will this cause issues with global locale?
		if (options && options.board && options.board.settings) {
			renderLocals.setLocale(renderLocals, options.board.settings.language);
		} else {
			renderLocals.setLocale(renderLocals, language);
		}
		html = pug.renderFile(`${templateDirectory}${templateName}`, mergedLocals);
	}

	//lock to prevent concurrent disk write
	const lock = await redlock.lock(`locks:${htmlName || json.name}`, lockWait);

	//write html/jsons
	let htmlPromise, jsonPromise;
	if (html !== null) {
		htmlPromise= outputFile(`${uploadDirectory}/html/${htmlName}`, html);
	}
	if (json !== null) {
		jsonPromise = outputFile(`${uploadDirectory}/json/${json.name}`, JSON.stringify(json.data));
	}
	await Promise.all([htmlPromise, jsonPromise]);

	//unlock after finishing
	await lock.unlock();

	return { html, json: json ? json.data : null };

};
