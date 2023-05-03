import prettyMilliseconds from "pretty-ms";
import prettyBytes from "pretty-bytes";
import io from "socket.io-client";
import { v4 as uuidv4 } from "uuid";
import { EventEmitter } from "events";

import axios from "axios";
import localforage from "localforage";
import User from "./User";
import Betweeny from "./Betweeny";

export default class WrangleBotAPIClient extends EventEmitter {
  version = "http://127.0.0.1:3200/api/v1";
  baseUrl = "http://127.0.0.1:3200";
  timeOutAfter = 60000;
  token;
  socket;

  subscriptions = [];

  request;

  _user;

  static BROADCAST = null;

  logs = [];

  constructor(options = {}) {
    super();
    this.version = options.version || this.version;
    this.baseUrl = options.baseUrl || this.baseUrl;
    this.timeOutAfter = options.timeOutAfter || this.timeOutAfter;
    this.token = options.token || this.token;
  }

  get status() {
    return { connected: this.socket ? this.socket.connected : false }
  }

  get log() {
    return {
      /**
       * @param message - The message to log
       * @param data - The data to log
       */
      add: (message, data = {}) => {
        //console.log(message, data);
        this.logs.push({
          time: Date.now(),
          message,
          level: "stdout",
          data,
        });
      },
    };
  }

  /**
   * This function takes a username and password and makes a post request to /login
   * If the request is successful, it assigns the response token to the token property, and assigns a new User object to the _user property.
   * If the request fails, it rejects the promise.
   * @param {string} username - the username of the user
   * @param {string} password - the password of the user
   * @return {Promise} - a promise that resolves with the token string and rejects with an error
   */
  signIn(username, password) {
    return new Promise((resolve, reject) => {
      this.post("/login", {
        username,
        password,
      })
        .then((response) => {
          this.token = response.token;
          this._user = new User(response);
          resolve(response.token);
        })
        .catch((error) => {
          reject(error);
        });
    });
  }

  /**
   * This function is used to sign out a user.
   *
   * @param {string} token
   * @param {object} user
   * @param {WebSocket} socket
   * @return {Promise} Returns a promise that resolves to true if the user was signed out successfully and rejects if the user was not signed out successfully.
   */
  signOut() {
    return new Promise((resolve, reject) => {
      localforage
        .removeItem("token")
        .then(() => {
          this.token = null;
          this._user = null;
          this.socket.close();
          resolve(true);
        })
        .catch((e) => {
          reject(e);
        });
    });
  }

  #loadToken() {
    return new Promise((resolve, reject) => {
      localforage
        .getItem("token")
        .then((token) => {
          this.token = token;
          resolve(token);
        })
        .catch((e) => {
          reject(e);
        });
    });
  }

  #setToken(token) {
    return new Promise((resolve, reject) => {
      localforage
        .setItem("token", token)
        .then((r) => {
          resolve(true);
        })
        .catch((e) => {
          reject(e);
        });
    });
  }

  /**
   * Initialize the API client
   * @params {{token: String, username: String, password : String}} options
   * @returns {Promise<WrangleBotAPIClient>|WrangleBotAPIClient}
   */
  connect(options = {}) {
    return new Promise((resolve, reject) => {
      if (this.socket && this.socket.connected) resolve(this);

      const { token } = options;
      if (token) {
        console.log("Connecting with token");
        this.#setToken(token).then(() => {
          this.#connectToSocket()
            .then((r) => {
              console.log("Connected to socket");

              this.hook("subscription", (data) => {
                this.emit("subscription", data);
              });

              resolve(true);
            })
            .catch((e) => {
              reject(e);
            });
        });
      } else {
        console.log("No token provided, trying to load from local storage");
        this.#loadToken().then((token) => {
          if (!token)
            reject(
              new Error("No Token Provided and none found in local storage")
            );

          console.log("Token found in local storage, connecting to socket");
          this.#connectToSocket()
            .then((r) => {
              console.log("Connected to socket");

              this.hook("subscription", (data) => {
                this.emit("subscription", data);
              });

              resolve(true);
            })
            .catch((e) => {
              reject(e);
            });
        });
      }
    });
  }

  #connectToSocket() {
    return new Promise((resolve, reject) => {
      const timeOut = (ms) => {
        return new Promise((resolve) => setTimeout(resolve, ms));
      };

      this.socket = io(this.baseUrl, {
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: Infinity,
      });

      this.socket.on("connected", () => {
        this.tween(null, "auth", {
          token: this.token,
        });

        this.socket.on("token", (response) => {
          if (response.status === 200) {
            console.log("[WS] Connected");
            this.token = response.data.token;
            this._user = new User(response.data);

            this.on("subscription", (betweeny) => {
              for (let i = 0; i < this.subscriptions.length; i++) {
                this.subscriptions[i].listener(betweeny);
              }
            });

            resolve(this);
          } else {
            reject(response);
          }
        });

        this.socket.on("disconnect", () => {
          console.log("[WS] Disconnected");
          this.emit("disconnect");
        });
      });

      timeOut(this.timeOutAfter).then(() => {
        if (this.socket.connected) {
          resolve(this);
        } else {
          reject(
            new Error("Connection timed out after " + this.timeOutAfter + "ms")
          );
        }
      });
    });
  }

  /**
   * Hooks a function to a specific event
   * @param {String} event
   * @param event - event name
   * @param {Function} callback - The function to be called when the event is fired
   * @param {Object|WrangleBotAPIClient} ref - The object that will be passed to the callback
   */
  hook(event, callback, ref = this) {
    if (typeof callback === "function") {
      this.socket.on(event, callback);
    } else {
      throw new Error("Callback of " + event + " must be a function");
    }
  }

  /**
   * Hooks a function to a specific event once
   * @param {String} event
   * @param event - event name
   * @param {Function} callback - The function to be called when the event is fired
   * @param {Object|WrangleBotAPIClient} ref - The object that will be passed to the callback
   */
  hookOnce(event, callback, ref = this) {
    if (typeof callback === "function") {
      this.socket.once(event, callback);
    } else {
      throw new Error("Callback of " + event + " must be a function");
    }
  }

  unhook(event) {
    this.socket.removeAllListeners(event);
  }

  /**
   * Sends data to the server
   * @param {BROADCAST|string} address
   * @param address - the address to send the data to, defaults to broadcast
   * @param {string} event - The event name
   * @param {Object} data - The data to send
   */
  tween(address = WrangleBotAPIClient.BROADCAST, event, data) {
    return this.$emit(event, new Betweeny(address, data));
  }

  /**
   * The subscribe() function is used to subscribe to an event identified by an ID.
   * It sends a request to the WrangleBotAPIClient to subscribe to the event,
   * and then creates a listener that checks for a successful response with the correct event and ID.
   * If the response is successful, the callback function is called with the data from the response.
   *
   * @param {string} event
   * @param {string} id
   * @param {function} callback
   */
  subscribe(event, id, callback) {
    this.tween(WrangleBotAPIClient.BROADCAST, "subscribe", {
      event,
      id,
    });

    const listener = (betweeny) => {
      if (
        betweeny.status === 200 &&
        betweeny.data.event === event &&
        betweeny.data.id === id
      ) {
        callback(betweeny.data.data ? betweeny.data.data : null);
      }
    };

    this.subscriptions.push({
      event,
      id,
      listener,
    });
  }

  /**
   * The unsubscribe() function is used to unsubscribe from an event identified by an ID.
   * It sends a request to the WrangleBotAPIClient to unsubscribe from the event,
   * and then removes the listeners that were created by the subscribe() function.
   *
   * @param {string} event
   * @param {string} id
   * @returns {void}
   **/
  unsubscribe(event, id) {
    this.tween(WrangleBotAPIClient.BROADCAST, "unsubscribe", {
      event,
      id,
    });
    this.subscriptions = this.subscriptions.filter((sub) => {
      return !(sub.event === event && sub.id === id);
    });
  }

  /**
   * Sends a Betweeny to the server   *   * @param {String} event
   * @param event - The event name
   * @param {Betweeny} data - The data to send
   */
  $emit(event, data) {
    if (data instanceof Betweeny) {
      this.socket.emit(event, data.toJSON());
    } else {
      throw new Error("Data of " + event + " must be an instance of Betweeny");
    }
  }

  get user() {
    if (!this._user) {
      return false;
    }
    this._user.save = (options) => {
      return new Promise((resolve, reject) => {
        this.put(this.version + "/users/" + this._user.username, {
          firstName: options.firstName,
          lastName: options.lastName,
          email: options.email,
          password: options.password || null,
        })
          .then((response) => {
            if (response.status === 200) {
              this._user.update(options);
              resolve(true);
            } else {
              reject(response);
            }
          })
          .catch((error) => {
            reject(error);
          });
      });
    };
    return this._user;
  }

  get utility() {
    return {
      prettyMilliseconds: function (ms) {
        try {
          return prettyMilliseconds(Number(ms));
        } catch (e) {
          return ms;
        }
      },
      prettyBytes(bytes) {
        try {
          return prettyBytes(Number(bytes));
        } catch (e) {
          return bytes;
        }
      },
      uuid() {
        return uuidv4();
      },
    };
  }

  get(uri, params) {
    return new Promise((resolve, reject) => {
      this.log.add(`[GET] ${uri}`, null);
      axios
        .get(this.version + uri, {
          method: "GET",
          params: params ? params : undefined,
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + this.token,
          },
        })
        .then((response) => {
          this.log.add(`[API] ${uri} : ${response.status}`, response);
          if (response.status === 200) {
            resolve(response.data);
          } else {
            reject(response);
          }
        })
        .catch((error) => {
          this.log.add(error);
          reject(error);
        });
    });
  }

  post(uri, data) {
    return new Promise((resolve, reject) => {
      this.log.add(`[POST] ${uri}`, data);
      axios
        .post(this.version + uri, data, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + this.token,
          },
        })
        .then((response) => {
          this.log.add(`[API] ${uri} : ${response.status}`, response);
          if (response.status === 200) {
            resolve(response.data);
          } else {
            reject(response);
          }
        })
        .catch((error) => {
          this.log.add(error);
          reject(error);
        });
    });
  }

  delete(uri) {
    return new Promise((resolve, reject) => {
      this.log.add(`[DELETE] ${uri}`, null);
      axios
        .delete(this.version + uri, {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + this.token,
          },
        })
        .then((response) => {
          this.log.add(`[API] ${uri} : ${response.status}`, response);
          if (response.status === 200) {
            resolve(response.data);
          } else {
            reject(response);
          }
        })
        .catch((error) => {
          this.log.add(error);
          reject(error);
        });
    });
  }

  put(uri, data) {
    return new Promise((resolve, reject) => {
      this.log.add(`[PUT] ${uri}`, data);
      axios
        .put(this.version + uri, data, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + this.token,
          },
        })
        .then((response) => {
          this.log.add(`[API] ${uri} : ${response.status}`, response);
          if (response.status === 200) {
            resolve(response.data);
          } else {
            reject(response);
          }
        })
        .catch((error) => {
          this.log.add(error);
          reject(error);
        });
    });
  }

  get query() {
    return {
      library: {
        one: (id) => {
          const uri = `/library/${id}`;
          return {
            fetch: async () => {
              return await this.get(uri);
            },
            put: async (data) => {
              return await this.put(uri, data);
            },
            delete: async () => {
              return await this.delete(uri);
            },
            scan: async () => {
              return await this.post(uri + "/scan");
            },
            tasks: {
              post: async (data) => {
                const uriTasks = `/tasks`;
                return await this.post(uri + uriTasks, data);
              },
              many: (filters = {}) => {
                const uriTasks = `/tasks`;
                return {
                  fetch: async () => {
                    return await this.get(uri + uriTasks);
                  },
                };
              },
              generate: async (data) => {
                const uriTasks = `/tasks/generate`;
                return await this.post(uri + uriTasks, data);
              },
              one: (id) => {
                const uriTasks = `/tasks/${id}`;
                return {
                  fetch: async () => {
                    return await this.get(uri + uriTasks);
                  },
                  put: async (data) => {
                    return await this.put(uri + uriTasks, data);
                  },
                  delete: async () => {
                    return await this.delete(uri + uriTasks);
                  },
                  run: async () => {
                    const uriTasksRun = `/run`;
                    return await this.post(uri + uriTasks + uriTasksRun);
                  },
                  stop: async () => {
                    const uriTasksStop = `/stop`;
                    return await this.post(uri + uriTasks + uriTasksStop);
                  },
                };
              },
            },
            metafiles: {
              many: (filters = {}) => {
                const uriMetafiles = `/metafiles`;
                return {
                  fetch: async () => {
                    return await this.get(uri + uriMetafiles, {
                      extended: true,
                    });
                  },
                  export: {
                    transcode: {
                      post: async (data) => {
                        const uriExportTrans = `/transcode`;
                        return await this.post(uri + uriExportTrans, data);
                      },
                    },
                  },
                  thumbnails: {
                    generate: async () => {
                      const uriThumbnails = `/thumbnails`;
                      return await this.post(
                        uri + uriMetafiles + uriThumbnails,
                        {
                          files: filters.$ids,
                        }
                      );
                    },
                  },
                  analyse: async (options) => {
                    const uriAnalyse = `/analyse`;
                    return await this.post(uri + uriMetafiles + uriAnalyse, {
                      metafiles: filters.$ids,
                      ...options,
                    });
                  }
                };
              },
              one: (id) => {
                const uriMetafiles = `/metafiles/${id}`;
                return {
                  fetch: async () => {
                    return await this.get(uri + uriMetafiles);
                  },
                  put: async (data) => {
                    return await this.put(uri + uriMetafiles, data);
                  },
                  delete: async () => {
                    return await this.delete(uri + uriMetafiles);
                  },
                  thumbnails: {
                    generate: async () => {
                      const uriThumbnails = `/thumbnails`;
                      return await this.post(
                        uri + uriMetafiles + uriThumbnails
                      );
                    },
                    center: async () => {
                      const uriThumbnails = `/thumbnails/center`;
                      return await this.get(uri + uriMetafiles + uriThumbnails);
                    },
                    first: async () => {
                      const uriThumbnails = `/thumbnails/first`;
                      return await this.get(uri + uriMetafiles + uriThumbnails);
                    },
                    last: async () => {
                      const uriThumbnails = `/thumbnails/last`;
                      return await this.get(uri + uriMetafiles + uriThumbnails);
                    },
                    all: async () => {
                      const uriThumbnails = `/thumbnails/all`;
                      return await this.get(uri + uriMetafiles + uriThumbnails,{
                        extended: true,
                      });
                    },
                    analyse: async (options) => {
                      const uriThumbnails = `/thumbnails/analyse`;
                      return await this.post(uri + uriMetafiles + uriThumbnails, options);
                    }
                  },
                  metadata: {
                    put: async (key, data) => {
                      const uriMetadata = `/metadata/${key}`;
                      return await this.put(uri + uriMetafiles + uriMetadata, {
                        value: data,
                      });
                    },
                  },
                  metacopies: {
                    many: (filters = {}) => {
                      const uriMetacopies = `/metacopies`;
                      return {
                        fetch: async () => {
                          return await this.get(
                            uri + uriMetafiles + uriMetacopies
                          );
                        },
                      };
                    },
                    one: (id) => {
                      const uriMetacopies = `/metacopies/${id}`;
                      return {
                        fetch: async () => {
                          return await this.get(
                            uri + uriMetafiles + uriMetacopies
                          );
                        },
                        show: async () => {
                          const uriShow = `/show`;
                          return await this.post(
                            uri + uriMetafiles + uriMetacopies + uriShow
                          );
                        },
                        delete: async () => {
                          return await this.delete(
                            uri + uriMetafiles + uriMetacopies,
                            {
                              deleteFile: false,
                            }
                          );
                        },
                      };
                    },
                  },
                };
              },
            },
            transcodes: {
              one: (id) => {
                const uriTranscodes = `/transcode/${id}`;
                return {
                  fetch: async () => {
                    await this.get(uri + uriTranscodes);
                  },
                  delete: async () => {
                    await this.delete(uri + uriTranscodes);
                  },
                  run: async () => {
                    return await this.post(uri + uriTranscodes);
                  },
                  cancel: async () => {
                    return await this.post(uri + uriTranscodes + "/cancel");
                  },
                };
              },
              many: (filters = {}) => {
                const uriTranscodes = `/transcode`;
                return {
                  fetch: async () => {
                    return await this.get(uri + uriTranscodes);
                  },
                };
              },
            },
            transactions: {
              many: (filters = {}) => {
                const uriTransactions = `/transactions`;
                return {
                  fetch: async () => {
                    return await this.get(uri + uriTransactions);
                  },
                };
              },
            },
            folders: {
              put: async (data) => {
                const uriFolders = `/folders`;

                if (!data.pathToFolder)
                  throw new Error("API Error: pathToFolder is required");
                if (!data.overwrite)
                  throw new Error("API Error: overwrite is required");

                return await this.put(uri + uriFolders, data);
              },
            },
            export: async (files, options) => {
              const uriExport = `/metafiles/export`;
              return await this.post(uri + uriExport, {
                files,
                ...options,
              });
            },
          };
        },
        many: (filters) => {
          const uri = `/library`;
          return {
            fetch: async () => {
              return await this.get(uri);
            },
          };
        },
        post: {
          one: async (data) => {
            const uri = `/library`;
            return await this.post(uri, data);
          },
        },
      },
      volumes: {
        many: (filters) => {
          const uri = `/volumes`;
          return {
            fetch: async () => {
              return await this.get(uri);
            },
          };
        },
        one: (id) => {
          const uri = `/volumes/${id}`;
          return {
            fetch: async () => {
              return await this.get(uri);
            },
            eject: async () => {
              const uriUnmount = `/eject`;
              return await this.post(uri + uriUnmount);
            },
          };
        },
      },
      utility: {
        index: async (pathToFolder, types) => {
          return await this.post(`/utility/index`, {
            path: pathToFolder,
            types,
          });
        },
        transcode: async () => {
          return await this.get("/status/transcode");
        },
        luts: async () => {
          return await this.get("/utility/luts");
        },
        list: async (pathToFolder, options) => {
          return await this.post(`/utility/list`, {
            path: pathToFolder,
            options,
          });
        }
      },
      users: {
        many: (filters) => {
          const uri = `/users`;
          return {
            fetch: async () => {
              return await this.get(uri);
            },
          };
        },
        one: (id) => {
          const uri = `/users/${id}`;
          return {
            fetch: async () => {
              return await this.get(uri);
            },
            put: async (data) => {
              return await this.put(uri, data);
            },
            delete: async () => {
              return await this.delete(uri);
            },
          };
        },
        post: async (data) => {
          const uri = `/users`;
          return await this.post(uri, data);
        },
      },
      finder: {
        show: async (path) => {
          return await axios.post(
            "/finder/open/",
            {
              path,
            },
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
            }
          );
        },
      },
    };
  }
}