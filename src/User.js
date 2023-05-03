export default class User {
	username;
	firstName;
	lastName;
	email;
	roles = [];
	libraries = [];

	constructor(options) {
		if (!options.username) throw new Error("Username is required");

		this.update(options);
	}

	hasRole(role) {
		return this.roles.includes(role);
	}

	hasLibrary(library) {
		return this.libraries.includes(library);
	}

	get shortCode() {
		return this.username.substring(0, 1);
	}

	update(options) {
		this.username = options.username || this.username;
		this.email = options.email;
		this.firstName = options.firstName;
		this.lastName = options.lastName;
		this.roles = options.roles || [];
		this.libraries = options.libraries || [];
	}
}