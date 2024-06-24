/* globals setDefaultLocalStorage setLocalStorage */
const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+/';
const generatePassword = () => {
	try {
		if (window.crypto) {
			const buf = new Uint8Array(20); //8 keeps charcodes within range
			window.crypto.getRandomValues(buf);
			return btoa(String.fromCharCode.apply(null, buf));
		}
	} catch (e) { /* Uncaught DOMException: The operation failed for an operation-specific reason, thanks firefox */ }
	return new Array(20)
		.fill(null)
		.map(() => charset[Math.floor(Math.random()*charset.length)])
		.join('');
};

setDefaultLocalStorage('postpassword', generatePassword());

class syncedField {
	constructor(selector, key, oneWay=false, persistent=true) {
		this.fields = [];
		this.selector = selector;
		this.key = key;
		this.oneWay = oneWay;
		this.persistent = persistent;
		this.init();
	}
	init() {
		const settingsFields = document.getElementById('settingsmodal').querySelectorAll(this.selector);
		this.fields = this.fields.concat([...settingsFields]);

		const postForm = document.getElementById('postform');
		if (postForm) {
			const postformFields = postForm.querySelectorAll(this.selector);
			this.fields = this.fields.concat([...postformFields]);
		}

		const actionForm = document.getElementById('actionform');
		if (actionForm) {
			const actionFields = actionForm.querySelectorAll(this.selector);
			this.fields = this.fields.concat([...actionFields]);
		}

		if (this.oneWay) {
			settingsFields[0].addEventListener('input', (e) => { this.update(e); }, false);
		}
		for (let field of this.fields) {
			!this.oneWay && field.addEventListener('input', (e) => { this.update(e); }, false);
			field.form && field.form.addEventListener('reset', () => {
				setTimeout(() => {
					this.set(localStorage.getItem(this.key));
				}, 0);
			}, false);
		}
		this.set(localStorage.getItem(this.key));
	}
	update(e) {
		if (this.persistent) {
			setLocalStorage(this.key, e.target.value);
		}
		this.set(e.target.value);
	}
	set(val) {
		if (val === null) { return; }
		for (let field of this.fields) {
			field.value = val;
			if (field.tagName === 'SELECT') {
				//necessary to set selectedIndex here?
				const changeEvent = new Event('change');
				field.dispatchEvent(changeEvent);
			}
		}
	}

}

window.addEventListener('settingsReady', () => {

	new syncedField('input[name="postpassword"]', 'postpassword');
	new syncedField('input[name="name"]', 'name');

	const boardUri = window.location.pathname.split('/')[1];
	new syncedField('select[name="customflag"]', `customflag-${boardUri}`);

});
