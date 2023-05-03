// WrangleBot Client Example
// Example of how to use the client in a browser environment

// import the client from the src folder (this will be changed when we publish to npm)

import WrangleBotAPIClient from "../src/Client";

// helper to get the location of the app
const appLocation = `${window.location.protocol}//${window.location.hostname}${
	window.location.port
		? ":" + (Number(window.location.port.toString()) - 100)
		: ""
}`;

// create a new instance of the client
const wapi = new WrangleBotAPIClient({
	baseUrl: appLocation, // the host url
	version: appLocation + "/api/v1", // the versioned api url,
	// the following are optional
	// token: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxx", // the token to use for authentication, leave empty to login with username and password
});

wapi.signIn("admin", "admin").then((token) => {
	wapi.connect().then((client) => {
		if (!client) throw new Error("Failed to connect");

		wapi.query.library.one('test').then((library) => {
			console.log(library);
		})
	});
});

