export default class Betweeny {
	/**
	 * @type {String}
	 */
	address;

	/**
	 * @type {Object}
	 */
	data;

	/**
	 * Creates a new Betweeny
	 *
	 * @param {String} address
	 * @param address
	 * @param {Object} data
	 */
	constructor(address = null, data) {
		this.address = address;
		this.data = data;
		return this;
	}

	/**
	 * Flatten the Betweeny into a JSON object
	 * @return {Object}
	 */
	toJSON() {
		return {
			address: this.address,
			data: this.data,
		};
	}
}