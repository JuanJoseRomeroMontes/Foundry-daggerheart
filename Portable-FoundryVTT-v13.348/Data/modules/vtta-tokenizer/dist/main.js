/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
var __webpack_exports__ = {};

;// CONCATENATED MODULE: ./src/libs/logger.js
const logger = {
  _showMessage: (logLevel, data) => {
    if (!logLevel || !data || typeof logLevel !== "string") {
      return false;
    }

    const setting = game.settings.get("vtta-tokenizer", "log-level");
    const logLevels = ["DEBUG", "INFO", "WARN", "ERR", "OFF"];
    const logLevelIndex = logLevels.indexOf(logLevel.toUpperCase());
    if (
      setting == "OFF"
      || logLevelIndex === -1
      || logLevelIndex < logLevels.indexOf(setting)
    ) {
      return false;
    }
    return true;
  },
  log: (logLevel, ...data) => {
    if (!logger._showMessage(logLevel, data)) {
      return;
    }

    logLevel = logLevel.toUpperCase();

    const LOG_PREFIX = "Tokenizer";
    let msg
      = "No logging message provided.  Please see the payload for more information.";
    let payload = data.slice();
    if (data[0] && typeof (data[0] == "string")) {
      msg = data[0];
      if (data.length > 1) {
        payload = data.slice(1);
      } else {
        payload = null;
      }
    }
    msg = `${LOG_PREFIX} | ${logLevel} > ${msg}`;
    switch (logLevel) {
      case "DEBUG":
        if (payload) {
          console.debug(msg, ...payload); // eslint-disable-line no-console
        } else {
          console.debug(msg); // eslint-disable-line no-console
        }
        break;
      case "INFO":
        if (payload) {
          console.info(msg, ...payload); // eslint-disable-line no-console
        } else {
          console.info(msg); // eslint-disable-line no-console
        }
        break;
      case "WARN":
        if (payload) {
          console.warn(msg, ...payload); // eslint-disable-line no-console
        } else {
          console.warn(msg); // eslint-disable-line no-console
        }
        break;
      case "ERR":
        if (payload) {
          console.error(msg, ...payload); // eslint-disable-line no-console
        } else {
          console.error(msg); // eslint-disable-line no-console
        }
        break;
      default:
        break;
    }
  },

  debug: (...data) => {
    logger.log("DEBUG", ...data);
  },

  info: (...data) => {
    logger.log("INFO", ...data);
  },

  warn: (...data) => {
    logger.log("WARN", ...data);
  },

  error: (...data) => {
    logger.log("ERR", ...data);
  },
};

/* harmony default export */ const libs_logger = (logger);

;// CONCATENATED MODULE: ./src/libs/DirectoryPicker.js
/**
 * Game Settings: Directory
 */




const FPClass = foundry?.applications?.apps?.FilePicker?.implementation ?? FilePicker;

class DirectoryPicker extends FPClass {

  static async uploadToPath(path, file) {
    const options = DirectoryPicker.parse(path);
    return FPClass.upload(options.activeSource, options.current, file, { bucket: options.bucket }, { notify: false });
  }


  // formats the data into a string for saving it as a GameSetting
  static format(value) {
    return value.bucket !== null
      ? `[${value.activeSource}:${value.bucket}] ${value.path ?? value.current ?? ""}`
      : `[${value.activeSource}] ${value.path ?? value.current ?? ""}`;
  }

  // parses the string back to something the FilePicker can understand as an option
  static parse(inStr) {
    const str = inStr ?? '';
    let matches = str.match(/\[(.+)\]\s*(.+)?/u);

    if (matches) {
      let [, source, current = ''] = matches;
      current = current.trim();
      const [s3, bucket] = source.split(":");
      if (bucket !== undefined) {
        return {
          activeSource: s3,
          bucket: bucket,
          current: current,
          fullPath: inStr,
        };
      } else {
        return {
          activeSource: s3,
          bucket: null,
          current: current,
          fullPath: inStr,
        };
      }
    }
    // failsave, try it at least
    return {
      activeSource: "data",
      bucket: null,
      current: str,
    };
  }

  static extractUrl(str) {
    let options = DirectoryPicker.parse(str);
    if (options.activeSource === "data" || options.activeSource === "public") {
      return undefined;
    } else {
      return options.current;
    }
  }


  static async forgeCreateDirectory(target) {
    if (!target) return;
    const response = await ForgeAPI.call('assets/new-folder', { path: target });
    if (!response || response.error) {
      throw new Error(response ? response.error : "Unknown error while creating directory.");
    }
  }

  /**
   * @param  {string} source
   * @param  {string} target
   * @param  {object} options={}
   */
  static async createDirectory(source, target, options = {}) {
    if (!target) {
      throw new Error("No directory name provided");
    }
    if (typeof ForgeVTT !== "undefined" && ForgeVTT?.usingTheForge) {
      return DirectoryPicker.forgeCreateDirectory(target);
    }
    return FPClass.createDirectory(source, target, options);
  }

  /**
   * Verifies server path exists, and if it doesn't creates it.
   *
   * @param  {object} parsedPath - output from DirectoryPicker,parse
   * @param  {string} targetPath - if set will check this path, else check parsedPath.current
   * @returns {boolean} - true if verfied, false if unable to create/verify
   */
  static async verifyPath(parsedPath, targetPath = null) {
    try {
      const paths = (targetPath) ? targetPath.split("/") : parsedPath.current.split("/");
      let currentSource = paths[0];

      for (let i = 0; i < paths.length; i += 1) {
        try {
          if (currentSource !== paths[i]) {
            currentSource = `${currentSource}/${paths[i]}`;
          }
          // eslint-disable-next-line no-await-in-loop
          await DirectoryPicker.createDirectory(parsedPath.activeSource, `${currentSource}`, { bucket: parsedPath.bucket });

        } catch (err) {
          const errMessage = `${(err?.message ?? Utils.isString(err) ? err : err)}`.replace(/^Error: /, "").trim();
          if (!errMessage.startsWith("EEXIST") && !errMessage.startsWith("The S3 key")) {
            libs_logger.error(`Error trying to verify path [${parsedPath.activeSource}], ${parsedPath.current}`, err);
          }
        }
      }
    } catch (err) {
      return false;
    }

    return true;
  }

  static async getForgeUrl(directoryPath, filename) {
    const dir = DirectoryPicker.parse(directoryPath);
    const prefix = ForgeVTT.ASSETS_LIBRARY_URL_PREFIX + await ForgeAPI.getUserId();
    return `${prefix}/${dir.current}/${filename}`;
    
  }

  static async getFileUrl(directoryPath, filename) {
    let uri;
    try {
      if (typeof ForgeVTT !== "undefined" && ForgeVTT?.usingTheForge) {
        uri = await DirectoryPicker.getForgeUrl(directoryPath, filename);
        return uri;
      } else {
        const dir = DirectoryPicker.parse(directoryPath);
        if (dir.activeSource == "data") {
          // Local on-server file system
          uri = dir.current + "/" + filename;
        } else if (dir.activeSource == "forgevtt") {
          const status = ForgeAPI.lastStatus || (await ForgeAPI.status());
          const userId = status.user;
          uri = `https://assets.forge-vtt.com/${userId}/${dir.current}/${filename}`;
        } else if (dir.activeSource == "s3") {
          // S3 Bucket
          uri = `https://${dir.bucket}.${game.data.files.s3.endpoint.hostname}/${dir.current}/${filename}`;
        } else {
          libs_logger.error("Tokenizer cannot handle files stored in that location", dir);
        }
      }
    } catch (exception) {
      throw new Error(`Unable to determine file URL for directoryPath "${directoryPath}" and filename "${filename}"`);
    }
    return encodeURI(uri);
  }
}

/* harmony default export */ const libs_DirectoryPicker = (DirectoryPicker);

;// CONCATENATED MODULE: ./src/libs/Utils.js



const SKIPPING_WORDS = [
  "the", "of", "at", "it", "a",
];

class Utils {

  static isObject(obj) {
    return typeof obj === 'object' && !Array.isArray(obj) && obj !== null;
  }

  static isString(str) {
    return typeof str === 'string' || str instanceof String;
  }

  static htmlToDoc (text) {
    const parser = new DOMParser();
    return parser.parseFromString(text, "text/html");
  }

  static endsWithAny(suffixes, string) {
    return suffixes.some((suffix) => {
        return string.endsWith(suffix);
    });
  }

  static dirPath(path) {
    return path.split("/").slice(0, -1).join("/");
  }

  static generateUUID() {
    // I generate the UID from two parts here
    // to ensure the random number provide enough bits.
    var firstPart = (Math.random() * 46656) || 0;
    var secondPart = (Math.random() * 46656) || 0;
    firstPart = ("000" + firstPart.toString(36)).slice(-3);
    secondPart = ("000" + secondPart.toString(36)).slice(-3);
    return firstPart + secondPart;
  }

  static U2A(str) {
    let reserved = "";
    const code = str.match(/&#(d+);/g);

    if (code === null) {
      return str;
    }

    for (var i = 0; i < code.length; i++) {
      reserved += String.fromCharCode(code[i].replace(/[&#;]/g, ""));
    }

    return reserved;
  }

  static getElementPosition(obj) {
    let curleft = 0,
      curtop = 0;
    if (obj.offsetParent) {
      do {
        curleft += obj.offsetLeft;
        curtop += obj.offsetTop;
      } while ((obj = obj.offsetParent));
      return { x: curleft, y: curtop };
    }
    return undefined;
  }

  static getRelativeCoords(event) {
    return { x: event.offsetX || event.layerX, y: event.offsetY || event.layerY };
  }

  static getCanvasCords(canvas, event) {
    const elementRelativeX = event.offsetX;
    const elementRelativeY = event.offsetY;
    const canvasRelativeX = elementRelativeX * canvas.width / canvas.clientWidth;
    const canvasRelativeY = elementRelativeY * canvas.height / canvas.clientHeight;
    return { x: canvasRelativeX, y: canvasRelativeY };
  }

  static upload() {
    let fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.click();

    return new Promise((resolve, reject) => {
      fileInput.addEventListener("change", (event) => {
        // setup the FileReader
        let file = event.target.files[0];
        let reader = new FileReader();
        reader.addEventListener("load", () => {
          let img = document.createElement("img");
          img.addEventListener("load", () => {
            resolve(img);
          });
          img.src = reader.result;
        });
        if (file) {
          reader.readAsDataURL(file);
        } else {
          reject("No input file given");
        }
      });
    });
  }

  /**
   * Should the image use the proxy?
   * @param {*} url
   */
  static async useProxy(url) {
    if (
      url.toLowerCase().startsWith("https://www.dndbeyond.com/")
      || url.toLowerCase().startsWith("https://dndbeyond.com/")
      || url.toLowerCase().startsWith("https://media-waterdeep.cursecdn.com/")
      || url.toLowerCase().startsWith("https://images.dndbeyond.com")
    ) {
      return true;
    } else if (
      await game.settings.get("vtta-tokenizer", "force-proxy")
      && url.toLowerCase().match("^https?://")
    ) {
      return true;
    } else {
      return false;
    }
  }

  /**
   * Converts url to proxied url
   * @param {*} url
   * @param {*} proxy
   */
  static proxiedUrl(url, proxy) {
    if (proxy.match("%URL%")) {
      return proxy.replace("%URL%", encodeURIComponent(url));
    } else {
      return proxy + url;
    }
  }

  /**
   * Downloads an image from a given URL
   * @param {String} url URL of the image that we try to download
   */
  static async download(url) {
    if (!url) url = "icons/mystery-man.png";
    const proxy = await game.settings.get("vtta-tokenizer", "proxy");
    const useProxy = await Utils.useProxy(url);
    const dateTag = `${+new Date()}`;
    const forge = (typeof ForgeVTT !== "undefined" && ForgeVTT?.usingTheForge);
    return new Promise((resolve, reject) => {
      const proxyImg = useProxy ? Utils.proxiedUrl(url, proxy) : url;
      // we remove existing data tag and add a new one
      // this forces chrome to reload the image rather than using the cached value
      // this can cause problems dues to https://stackoverflow.com/questions/12648809/cors-policy-on-cached-image
      // an exception for using moulinette on the forge because of _reasons_
      const imgSrc = forge && proxyImg.startsWith("moulinette")
        ? proxyImg
        : `${proxyImg.split("?")[0]}?${dateTag}`;
      let img = new Image();
      // cross origin needed for images from other domains
      // an empty value here defaults to anonymous
      img.crossOrigin = "";
      img.onerror = function(event) {
        libs_logger.error("Download listener error", event);
        reject(event);
      };
      img.onload = function() {
        libs_logger.debug("Loading image:", img);
        resolve(img);
      };
      // img.addEventListener("load", () => {
      //   logger.debug("Loading image:", img);
      //   resolve(img);
      // });
      // img.addEventListener("error", (event) => {
      //   logger.error("Download listener error", event);
      //   reject(event);
      // });
      // add image source after adding handlers
      img.src = imgSrc;
    });
  }

  static async uploadToFoundry(data, directoryPath, fileName) {
    // create new file from the response
    let file = new File([data], fileName, { type: data.type });

    const options = libs_DirectoryPicker.parse(directoryPath);

    libs_logger.debug(`Uploading ${fileName}`, { directoryPath, fileName, options });

    const FPClass = foundry?.applications?.apps?.FilePicker?.implementation ?? FilePicker;
    const result = await FPClass.upload(options.activeSource, options.current, file, { bucket: options.bucket }, { notify: false });

    return result.path;
  }

  static rgbToHex(r, g, b) {
    if (r > 255 || g > 255 || b > 255) throw new Error('Invalid color component');
    // eslint-disable-next-line no-bitwise
    return ((r << 16) | (g << 8) | b).toString(16);
  }

  static getHash(str, algo = "SHA-256") {
    let strBuf = new TextEncoder("utf-8").encode(str);

    if (window.isSecureContext) {
      return crypto.subtle.digest(algo, strBuf).then((hash) => {
        // window.hash = hash;
        // here hash is an arrayBuffer,
        // so we'll convert it to its hex version
        let result = "";
        const view = new DataView(hash);
        for (let i = 0; i < hash.byteLength; i += 4) {
          result += ("00000000" + view.getUint32(i).toString(16)).slice(-8);
        }
        return result;
      });
    } else {
      return new Promise((resolve) => {
        resolve(
          str.split("").reduce((a, b) => {
            // eslint-disable-next-line no-bitwise
            a = (a << 5) - a + b.charCodeAt(0);
            // eslint-disable-next-line no-bitwise
            return a & a;
          }, 0),
        );
      });
    }
  }

  static async makeSlug(name) {
    const toReplace
      = "а,б,в,г,д,е,ё,ж,з,и,й,к,л,м,н,о,п,р,с,т,у,ф,х,ц,ч,ш,щ,ъ,ы,ь,э,ю,я".split(
        ",",
      );
    const replacers
      = "a,b,v,g,d,e,yo,zh,z,i,y,k,l,m,n,o,p,r,s,t,u,f,kh,c,ch,sh,sch,_,y,_,e,yu,ya".split(
        ",",
      );
    const replaceDict = Object.fromEntries(
      toReplace.map((_, i) => [toReplace[i], replacers[i]]),
    );
    const unicodeString = name
      .toLowerCase()
      .split("")
      .map((x) => (Object.prototype.hasOwnProperty.call(replaceDict, x) ? replaceDict[x] : x))
      .join("")
      .replace(/[^\w.]/gi, "_")
      .replace(/__+/g, "_");
    let asciiString = Utils.U2A(unicodeString);
    return new Promise((resolve) => {
      if (asciiString.length < 2) {
        Utils.getHash(name).then((hash) => {
          libs_logger.debug("Tokenizer is having to use a hashed file name.");
          resolve(hash);
        });
      } else {
        resolve(asciiString);
      }
    });
  }

  static titleString (text) {
    const words = text.trim().split(" ");

    for (let i = 0; i < words.length; i++) {
      if (words[i][0] && (i == 0 || !SKIPPING_WORDS.includes(words[i]))) {
        words[i] = words[i][0].toUpperCase() + words[i].substr(1);
      }
    }

    return words.join(" ");
  }

  static extractImage(event, view) {
    const evData = event?.clipboardData || event?.dataTransfer;

    if (!evData.items) return;

    for (const item of evData.items) {
      if (item.type.startsWith('image')) {
        const blob = item.getAsFile();
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.addEventListener("load", () => {
          view.addImageLayer(img);
        });
        const reader = new FileReader();
        reader.onload = function(ev) {
          img.src = ev.target.result;
        }; 
        reader.readAsDataURL(blob);
      }
    }
  }

  static cloneCanvas(sourceCanvas) {
    const cloneCanvas = document.createElement("canvas");
    cloneCanvas.width = sourceCanvas.width;
    cloneCanvas.height = sourceCanvas.height;
    cloneCanvas.getContext("2d").drawImage(sourceCanvas, 0, 0);
    return cloneCanvas;
  }

  static versionCompare (v1, v2, options) {
    const lexicographical = options && options.lexicographical;
    const zeroExtend = options && options.zeroExtend;
    let v1parts = v1.split(".");
    let v2parts = v2.split(".");

    function isValidPart(x) {
      return (lexicographical ? /^\d+[A-Za-z]*$/ : /^\d+$/).test(x);
    }

    if (!v1parts.every(isValidPart) || !v2parts.every(isValidPart)) {
      return NaN;
    }

    if (zeroExtend) {
      while (v1parts.length < v2parts.length) v1parts.push("0");
      while (v2parts.length < v1parts.length) v2parts.push("0");
    }

    if (!lexicographical) {
      v1parts = v1parts.map(Number);
      v2parts = v2parts.map(Number);
    }

    for (var i = 0; i < v1parts.length; ++i) {
      if (v2parts.length == i) {
        return 1;
      }

      if (v1parts[i] > v2parts[i]) {
        return 1;
      }
      if (v1parts[i] < v2parts[i]) {
        return -1;
      }
    }

    if (v1parts.length != v2parts.length) {
      return -1;
    }

    return 0;
  }

  static throttle(cb, delay) {
    let wait = false;
  
    return (...args) => {
      if (wait) {
          return;
      }
  
      // eslint-disable-next-line callback-return
      cb(...args);
      wait = true;
      setTimeout(() => {
        wait = false;
      }, delay);
    };
  }

}



;// CONCATENATED MODULE: ./src/libs/MarchingSquares.js
/**
 * Copyright (c) 2012-2014, Michael Bostock All rights reserved.
 *  Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:
 *  Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
 *  Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
 *  The name Michael Bostock may not be used to endorse or promote products derived from this software without specific prior written permission.
 *  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL MICHAEL BOSTOCK BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 * Computes a contour for a given input grid function using the <a
 * href="http://en.wikipedia.org/wiki/Marching_squares">marching
 * squares</a> algorithm. Returns the contour polygon as an array of points.
 *
 * @param grid a two-input function(x, y) that returns true for values
 * inside the contour and false for values outside the contour.
 * @param start an optional starting point [x, y] on the grid.
 * @returns polygon [[x1, y1], [x2, y2], …]
 */

const geom = {};

// lookup tables for marching directions
const d3GeomContourDx = [1, 0, 1, 1, -1, 0, -1, 1, 0, 0, 0, 0, -1, 0, -1, NaN];
const d3GeomContourDy = [0, -1, 0, 0, 0, -1, 0, 0, 1, -1, 1, 1, 0, -1, 0, NaN];

function dGeomContourStart(grid) {
  let x = 0,
    y = 0;

  // search for a starting point; begin at origin
  // and proceed along outward-expanding diagonals
  while (!grid(x, y)) {
    if (x === 0) {
      x = y + 1;
      y = 0;
    } else {
      x -= 1;
      y += 1;
    }
  }

  return [x, y];
}

geom.contour = function(grid, start) {
  let s = start || dGeomContourStart(grid), // starting point
    c = [], // contour polygon
    x = s[0], // current x position
    y = s[1], // current y position
    dx = 0, // next x direction
    dy = 0, // next y direction
    pdx = NaN, // previous x direction
    pdy = NaN, // previous y direction
    i = 0;

  do {
    // determine marching squares index
    i = 0;
    if (grid(x - 1, y - 1)) i += 1;
    if (grid(x, y - 1)) i += 2;
    if (grid(x - 1, y)) i += 4;
    if (grid(x, y)) i += 8;

    // determine next direction
    if (i === 6) {
      dx = pdy === -1 ? -1 : 1;
      dy = 0;
    } else if (i === 9) {
      dx = 0;
      dy = pdx === 1 ? -1 : 1;
    } else {
      dx = d3GeomContourDx[i];
      dy = d3GeomContourDy[i];
    }

    // update contour polygon
    if (dx != pdx && dy != pdy) {
      c.push([x, y]);
      pdx = dx;
      pdy = dy;
    }

    x += dx;
    y += dy;
  } while (s[0] != x || s[1] != y);

  return c;
};

/**
 * End of Block for
 * Copyright (c) 2012-2014, Michael Bostock All rights reserved.
 */

;// CONCATENATED MODULE: ./src/constants.js
const CONSTANTS = {
  MODULE_ID: "vtta-tokenizer",
  MODULE_NAME: "Tokenizer",
  BLEND_MODES: {
    SOURCE_OVER: "source-over",
    SOURCE_IN: "source-in",
    SOURCE_OUT: "source-out",
    SOURCE_ATOP: "source-atop",
    DESTINATION_OVER: "destination-over",
    DESTINATION_IN: "destination-in",
    DESTINATION_OUT: "destination-out",
    DESTINATION_ATOP: "destination-atop",
    LIGHTER: "lighter",
    COPY: "copy",
    XOR: "xor",
    MULTIPLY: "multiply",
    SCREEN: "screen",
    OVERLAY: "overlay",
    DARKEN: "darken",
    LIGHTEN: "lighten",
    COLOR_DODGE: "color-dodge",
    COLOR_BURN: "color-burn",
    HARD_LIGHT: "hard-light",
    SOFT_LIGHT: "soft-light",
    DIFFERENCE: "difference",
    EXCLUSION: "exclusion",
    HUE: "hue",
    SATURATION: "saturation",
    COLOR: "color",
    LUMINOSITY: "luminosity",
  },
  TO_RADIANS: Math.PI / 180,
  TRANSPARENCY_THRESHOLD: 254,
  MASK_DENSITY: 400,
  COLOR: {
    OPAQUE_THRESHOLD: 254,
    TRANSPARENCY_THRESHOLD: 0,
  },
  MASK: {
    SAMPLE_SIZE: 5,
    MINIMUM_ALPHA: 255,
  },
  BAD_DIRS: ["[data]", "[data] ", "", null],
  NUMBERS: {
    ACTIVE: [
      "⓿",
      "❶",
      "❷",
      "❸",
      "❹",
      "❺",
      "❻",
      "❼",
      "❽",
      "❾",
      "❿",
      "⓫",
      "⓬",
      "⓭",
      "⓮",
      "⓯",
      "⓰",
      "⓱",
      "⓲",
      "⓳",
      "⓴",
    ],
    INACTIVE: [
      "⓪",
      "①",
      "②",
      "③",
      "④",
      "⑤",
      "⑥",
      "⑦",
      "⑧",
      "⑨",
      "⑩",
      "⑪",
      "⑫",
      "⑬",
      "⑭",
      "⑮",
      "⑯",
      "⑰",
      "⑱",
      "⑲",
      "⑳",
    ],
  },
};

CONSTANTS.PATH = `modules/${CONSTANTS.MODULE_ID}/`;

/* harmony default export */ const constants = (CONSTANTS);

;// CONCATENATED MODULE: ./src/libs/Color.js


class Color {

  constructor({ red = 0, green = 0, blue = 0, alpha = 1, tolerance = 50 } = {}) {
    this.red = red;
    this.green = green;
    this.blue = blue;
    this.alpha = alpha;
    this.tolerance = tolerance;
  }

  isNeighborColor(color) {
    return Math.abs(this.red - color.red) <= this.tolerance
      && Math.abs(this.green - color.green) <= this.tolerance
      && Math.abs(this.blue - color.blue) <= this.tolerance;
  }

  isOpaque() {
    return this.alpha > constants.COLOR.OPAQUE_THRESHOLD;
  }

}

;// CONCATENATED MODULE: ./src/libs/RayMask.js



function getEnrichedPixel(imageData, point) {
  const index = point.x + (point.y * imageData.height);
  const baseIndex = index * 4;
  const color = new Color(
    {
      red: imageData.data[baseIndex],
      green: imageData.data[baseIndex + 1],
      blue: imageData.data[baseIndex + 2],
      alpha: imageData.data[baseIndex + 3],
    },
  );
  return {
    x: point.x,
    y: point.y,
    color,
  };
}

// attempts a Bresenhams line algorithm
function getPixelLine(startPoint, endPoint) {
  const pixels = [];
  const dx = Math.abs(Math.floor(endPoint.x) - Math.floor(startPoint.x));
  const dy = Math.abs(Math.floor(endPoint.y) - Math.floor(startPoint.y));
  const sx = startPoint.x < endPoint.x ? 1 : -1;
  const sy = startPoint.y < endPoint.y ? 1 : -1;
  let err = dx - dy;
  let x = Math.floor(startPoint.x);
  let y = Math.floor(startPoint.y);
  let process = true;

  while (process) {
    pixels.push({ x, y });

    if (x === Math.floor(endPoint.x) && y === Math.floor(endPoint.y)) {
      process = false;
      break;
    } else {
      const e2 = 2 * err;
      if (e2 >= -dy) {
        err -= dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
    }
  }

  return pixels;
}


function findEdgeOnRay(imageData, startPoint, endPoint) {
  // get all pixels on ray
  const rayPixels = getPixelLine(startPoint, endPoint);
  // find colors and alpha of ray pixels
  const enrichedPixels = rayPixels.map((point) => getEnrichedPixel(imageData, point));

  let start = null;
  let end = null;
  let edgePixel = null;

  // check to see if we find an edge
  enrichedPixels.forEach((pixel, index) => {
    if (pixel.color.isOpaque()) {
      if (start === null) {
        start = index;
      } else {
        end = index;
      }
      edgePixel = !edgePixel || edgePixel.color.alpha < pixel.color.alpha
        ? pixel
        : edgePixel;
    } else if (end !== null) {
      // reset
      start = null;
      end = null;
    }
  });

  return edgePixel;
}


function createRay(imageData, startPoint, endPoint, findEdge = false) {
  return {
    startPoint,
    endPoint,
    edgePixel: findEdge ? findEdgeOnRay(imageData, startPoint, endPoint) : null,
    processed: findEdge,
  };
}

// get the co-ords of an edge on the canvas(mask)
// 0,0 is top left
function getCanvasEdge(mask, startNum) {
  let pos = startNum;
  if (pos < mask.width - 1) return { x: pos, y: 0 };
  pos -= mask.width - 1;
  if (pos < mask.height - 1) return { x: mask.width - 1, y: pos };
  pos -= mask.height - 1;
  if (pos < mask.width) return { x: mask.width - 1 - pos, y: mask.height - 1 };
  pos -= mask.width - 1;
  return { x: 0, y: mask.height - 1 - pos };
}

function createRays(mask, maskImageData) {
  const maskCentre = {
    x: mask.width / 2,
    y: mask.height / 2,
  };
  
  const edgePoints = (2 * mask.width) + (2 * (mask.height - 2));

  const rays = [];

  // first loop through all rays and process at sample size
  for (let rayIndex = 0; edgePoints > rayIndex; rayIndex++) {
    const sampleRay = rayIndex % constants.MASK.SAMPLE_SIZE === 0;
    const ray = createRay(
      maskImageData, 
      maskCentre,
      getCanvasEdge(mask, rayIndex),
      sampleRay,
    );

    // if we didn't find an edge pixel, lets step back over sample size
    if (sampleRay && !ray.edgePixel) {
      for (let stepIndex = rayIndex - 1; stepIndex < constants.MASK.SAMPLE_SIZE && (rayIndex - stepIndex) >= 0; stepIndex++) {
        const stepRay = createRay(
          maskImageData, 
          maskCentre,
          getCanvasEdge(mask, stepIndex),
          sampleRay,
        );
        if (stepRay.edgePixel) {
          rays.edgePixel = stepRay.edgePixel;
          break;
        }
      }
    }
    rays.push(ray);
  }
  return rays;
}

function generateRayMask(maskCanvas) {
  const maskImageData = maskCanvas
    .getContext("2d")
    .getImageData(0, 0, maskCanvas.width, maskCanvas.height);

  const mask = document.createElement("canvas");
  mask.width = maskCanvas.width;
  mask.height = maskCanvas.height;

  const rays = createRays(mask, maskImageData);

  const context = mask.getContext("2d");

  const edgePoints = rays
    .filter((ray) => ray.edgePixel)
    .map((ray) => ray.edgePixel);

  context.fillStyle = "black";

  // unable to calculate suitable radius, so just fill the whole mask
  if (edgePoints.length < 2) {
    context.rect(0, 0, mask.width, mask.height);
    context.fill();
  } else {
    context.beginPath();
    edgePoints.forEach((edgePoint, index) => {
      if (index === 0) {
        context.moveTo(edgePoint.x, edgePoint.y);
      } else {
        context.lineTo(edgePoint.x, edgePoint.y);
      }
    });
    context.closePath();
    context.fill();

  }

  return mask;
}

;// CONCATENATED MODULE: ./src/tokenizer/Masker.js



class Masker {

  #drawChequeredBackground(width = 7) {
    this.chequeredSource = document.createElement("canvas");
    this.chequeredSource.width = this.width;
    this.chequeredSource.height = this.height;
    
    const context = this.chequeredSource.getContext("2d");
    const fillStyle = context.fillStyle;
    const alpha = context.globalAlpha;
    const columns = Math.ceil(this.chequeredSource.width / width);
    const rows = Math.ceil(this.chequeredSource.height / width);

    context.fillStyle = "rgb(212, 163, 19)";
    for (let i = 0; i < rows; ++i) {
      for (let j = 0, col = columns / 2; j < col; ++j) {
        context.rect(
          (2 * j * width) + (i % 2 ? 0 : width),
          i * width,
          width,
          width,
        );
      }
    }
    context.fill();

    context.fillStyle = fillStyle;
    context.globalAlpha = alpha;

    this.chequeredSource.getContext("2d")
      .drawImage(
        this.layer.preview,
        0,
        0,
        this.layer.preview.width,
        this.layer.preview.height,
        this.yOffset,
        this.xOffset,
        this.scaledWidth,
        this.scaledHeight,
      );
  }

  #drawGreyScaleBackground() {
    this.greyscale = document.createElement("canvas");
    this.greyscale.width = this.width;
    this.greyscale.height = this.height;
    this.greyscale.filter = "grayscale()";
    this.greyscale.getContext("2d")
      .drawImage(
        this.layer.preview,
        0,
        0,
        this.layer.preview.width,
        this.layer.preview.height,
        this.yOffset,
        this.xOffset,
        this.scaledWidth,
        this.scaledHeight,
      );
  }

  #createBaseCanvas() {
    this.canvas = document.createElement("canvas");
    this.canvas.width = this.width;
    this.canvas.height = this.height;
  }

  #createMaskCanvas() {
    this.mask = Utils.cloneCanvas(this.canvas);
    this.mask.width = this.width;
    this.mask.height = this.height;

    this.maskContext = this.mask.getContext("2d");
    this.maskContext.resetTransform();
    this.maskContext.clearRect(0, 0, this.width, this.height);
    this.maskContext.drawImage(
      this.layer.renderedMask,
      0,
      0,
      this.layer.renderedMask.width,
      this.layer.renderedMask.height,
      this.yOffset,
      this.xOffset,
      this.scaledWidth,
      this.scaledHeight,
    );

    this.maskContext.lineJoin = "round";
    this.maskContext.lineCap = "round";
  }

  #createMaskedSourceCanvas() {
    this.maskedSource = document.createElement("canvas");
    this.maskedSource.width = this.width;
    this.maskedSource.height = this.height;
    const maskedContext = this.maskedSource.getContext("2d");
    // add the mask
    maskedContext.drawImage(this.mask, 0, 0);
    maskedContext.globalCompositeOperation = "source-in";
    // now the chequered layer
    maskedContext.drawImage(this.chequeredSource, 0, 0);
  }

  constructor(layer) {
    this.container = null;
    this.layer = layer;

    this.height = Math.min(1000, layer.preview.height, layer.preview.width);
    this.width = Math.min(1000, layer.preview.height, layer.preview.width);

    const crop = game.settings.get(constants.MODULE_ID, "default-crop-image");
    // if we crop the image we scale to the smallest dimension of the image
    // otherwise we scale to the largest dimension of the image
    const direction = crop ? layer.preview.height > layer.preview.width : layer.preview.height < layer.preview.width;

    this.scaledWidth = !direction
      ? this.height * (layer.preview.height / layer.preview.width)
      : this.width;
    this.scaledHeight = direction
      ? this.width * (layer.preview.height / layer.preview.width)
      : this.height;

    // offset the canvas for the scaled image
    this.yOffset = (this.width - this.scaledWidth) / 2;
    this.xOffset = (this.height - this.scaledHeight) / 2;

    // create base canvases
    this.#createBaseCanvas();
    this.#createMaskCanvas();

    // create background images
    this.#drawGreyScaleBackground();
    this.#drawChequeredBackground();

    this.brushSize = 20;
    this.maskChanged = false;
    this.currentPoint = { x: 0, y: 0 };
    this.previousPoint = null;
    this.mouseDown = false;
  }

  async display(callback, nestedCallback) {
    const html = await renderTemplate("modules/vtta-tokenizer/templates/mask-editor.hbs");
    this.container = $(html);
    this.container[0].append(this.canvas);
    $("body").append(this.container);
    this.#activateListeners(callback, nestedCallback);
  }

  getMousePointer(event) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  distanceBetweenLastAndCurrent() {
    return Math.sqrt(((this.currentPoint.x - this.previousPoint.x) ** 2) + ((this.currentPoint.y - this.previousPoint.y) ** 2));
  }

  angleBetweenLastAndCurrent() {
    return Math.atan2(this.currentPoint.x - this.previousPoint.x, this.currentPoint.y - this.previousPoint.y);
  }

  // eslint-disable-next-line consistent-return
  #saveAndCleanup(action, callback, nestedCallback) {
    window.cancelAnimationFrame(this.cancelAnimationFrame);
    window.removeEventListener("keyup", this.onKeyUp);
    this.container.remove();
    delete this.canvas;

    if (action === "ok" && this.maskChanged) {
      const mask = Utils.cloneCanvas(this.layer.renderedMask);
      // rescale the mask back up for the appropriate layer canvas size
      const context = mask.getContext("2d");
      context.resetTransform();
      context.clearRect(0, 0, this.layer.preview.width, this.layer.preview.height);
      mask.getContext("2d").drawImage(
        this.mask,
        this.yOffset,
        this.xOffset,
        this.scaledWidth,
        this.scaledHeight,
        0,
        0,
        this.layer.preview.width,
        this.layer.preview.height,
      );
      return callback(mask, nestedCallback);
    }
  }

  clickButton(event, callback, nestedCallback) {
    event.preventDefault();
    const action = event.data?.action ?? event.target?.dataset?.action;

    if (action) {
      this.#saveAndCleanup(action, callback, nestedCallback);
    }
  }

  drawArc(point, remove) {
    this.maskContext.globalCompositeOperation = remove
      ? "destination-out"
      : "destination-over";

    this.maskContext.fillStyle = "black";
    this.maskContext.beginPath();

    this.maskContext.arc(
      point.x / this.ratio,
      point.y / this.ratio,
      this.brushSize / this.ratio,
      0,
      2 * Math.PI,
    );
    this.maskContext.fill();
    this.maskChanged = true;
  }

  #activateListeners(callback, nestedCallback) {
    let rect = this.canvas.getBoundingClientRect();
    this.ratio = rect.width / this.canvas.width;

    this.canvas.addEventListener("wheel", (event) => {
      event.preventDefault();
      if (event.wheelDelta < 0) {
          if (this.brushSize > 50) this.brushSize -= 7;
          else if (this.brushSize > 25) this.brushSize -= 4;
          else if (this.brushSize > 10) this.brushSize -= 2;
          else this.brushSize--;
          if (this.brushSize <= 1) this.brushSize = 1;
      } else {
          if (this.brushSize > 50) this.brushSize += 7;
          else if (this.brushSize > 25) this.brushSize += 4;
          else if (this.brushSize > 10) this.brushSize += 2;
          else this.brushSize++;
          if (this.brushSize >= 100) this.brushSize = 100;
      }
      }, { passive: false },
    );

    this.canvas.addEventListener("mouseup", () => {
      this.mouseDown = false;
    });

    this.canvas.addEventListener("mousedown", (event) => {
      event.preventDefault();
      this.mouseDown = [0, 2].includes(event.button);
      if (this.mouseDown) {
        this.previousPoint = this.getMousePointer(event);
        this.drawArc(this.previousPoint, event.shiftKey || event.buttons === 2);
      }
    });

    this.canvas.addEventListener("mousemove", (event) => {
      this.currentPoint = this.getMousePointer(event);
      if (!this.mouseDown) return;

      const distanceBetween = (point1, point2) => {
        return Math.sqrt(((point2.x - point1.x) ** 2) + ((point2.y - point1.y) ** 2));
      };
      const angleBetween = (point1, point2) => {
        return Math.atan2(point2.x - point1.x, point2.y - point1.y);
      };

      const distance = distanceBetween(this.previousPoint, this.currentPoint);
      const angle = angleBetween(this.previousPoint, this.currentPoint);

      for (var i = 0; i < distance; i += 1) {
        const x = this.previousPoint.x + (Math.sin(angle) * i);
        const y = this.previousPoint.y + (Math.cos(angle) * i);
        this.drawArc({ x, y }, event.shiftKey || event.buttons === 2);
        this.previousPoint = this.currentPoint;
      }
    });


    // eslint-disable-next-line consistent-return
    this.onKeyUp = (event) => {
      const action = event.keyCode === 13
        ? "ok"
        : event.keyCode === 27
          ? "cancel"
          : null;

      if (action) {
        this.#saveAndCleanup(action, callback, nestedCallback);
      }
    };
    window.addEventListener("keyup", this.onKeyUp);

    const wrapper = document.getElementById("mask-editor-buttons");
    wrapper.addEventListener("click", (event) => {
      if (event.target.nodeName === 'BUTTON') {
        this.clickButton(event, callback, nestedCallback);
      }
    });

  }

  draw() {
    const context = this.canvas.getContext("2d");
    context.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // add a grey version to canvas
    context.globalAlpha = 0.25;
    context.drawImage(this.greyscale, 0, 0);
    context.globalAlpha = 1;

    // now the masked version
    this.#createMaskedSourceCanvas();
    context.drawImage(this.maskedSource, 0, 0);

    // add brush
    context.fillStyle = "black";
    context.beginPath();
    context.arc(
      this.currentPoint.x / this.ratio,
      this.currentPoint.y / this.ratio,
      this.brushSize / this.ratio,
      0,
      2 * Math.PI,
    );
    context.fill();

    // begin frame animation for duration of canvas
    this.cancelAnimationFrame = window.requestAnimationFrame(this.draw.bind(this));
  }
}

;// CONCATENATED MODULE: ./vendor/MagicWand.js
/* eslint-disable max-depth */
/* eslint-disable no-continue */
// Magic Wand from https://github.com/Tamersoul/magic-wand-js/

// The MIT License (MIT)

// Copyright (c) 2014, Ryasnoy Paul (ryasnoypaul@gmail.com)

// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:

// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

// eslint-disable-next-line complexity
function floodFillWithoutBorders(image, px, py, colorThreshold, mask) {
  let c,
    x,
    newY,
    el,
    xr,
    xl,
    dy,
    dyl,
    dyr,
    checkY,
    data = image.data,
    w = image.width,
    h = image.height,
    bytes = image.bytes, // number of bytes in the color
    maxX = -1,
    minX = w + 1,
    maxY = -1,
    minY = h + 1,
    i = (py * w) + px, // start point index in the mask data
    result = new Uint8Array(w * h), // result mask
    visited = new Uint8Array(mask ? mask : w * h); // mask of visited points

  if (visited[i] === 1) return null;

  i *= bytes; // start point index in the image data
  let sampleColor = [data[i], data[i + 1], data[i + 2], data[i + 3]]; // start point color (sample)

  let stack = [{ y: py, left: px - 1, right: px + 1, dir: 1 }]; // first scanning line
  do {
    el = stack.shift(); // get line for scanning

    checkY = false;
    for (x = el.left + 1; x < el.right; x++) {
      dy = el.y * w;
      i = (dy + x) * bytes; // point index in the image data

      if (visited[dy + x] === 1) continue; // check whether the point has been visited
      // compare the color of the sample
      c = data[i] - sampleColor[0]; // check by red
      if (c > colorThreshold || c < -colorThreshold) continue;
      c = data[i + 1] - sampleColor[1]; // check by green
      if (c > colorThreshold || c < -colorThreshold) continue;
      c = data[i + 2] - sampleColor[2]; // check by blue
      if (c > colorThreshold || c < -colorThreshold) continue;

      checkY = true; // if the color of the new point(x,y) is similar to the sample color need to check minmax for Y

      result[dy + x] = 1; // mark a new point in mask
      visited[dy + x] = 1; // mark a new point as visited

      xl = x - 1;
      // walk to left side starting with the left neighbor
      while (xl > -1) {
        dyl = dy + xl;
        i = dyl * bytes; // point index in the image data
        if (visited[dyl] === 1) break; // check whether the point has been visited
        // compare the color of the sample
        c = data[i] - sampleColor[0]; // check by red
        if (c > colorThreshold || c < -colorThreshold) break;
        c = data[i + 1] - sampleColor[1]; // check by green
        if (c > colorThreshold || c < -colorThreshold) break;
        c = data[i + 2] - sampleColor[2]; // check by blue
        if (c > colorThreshold || c < -colorThreshold) break;

        result[dyl] = 1;
        visited[dyl] = 1;

        xl--;
      }
      xr = x + 1;
      // walk to right side starting with the right neighbor
      while (xr < w) {
        dyr = dy + xr;
        i = dyr * bytes; // index point in the image data
        if (visited[dyr] === 1) break; // check whether the point has been visited
        // compare the color of the sample
        c = data[i] - sampleColor[0]; // check by red
        if (c > colorThreshold || c < -colorThreshold) break;
        c = data[i + 1] - sampleColor[1]; // check by green
        if (c > colorThreshold || c < -colorThreshold) break;
        c = data[i + 2] - sampleColor[2]; // check by blue
        if (c > colorThreshold || c < -colorThreshold) break;

        result[dyr] = 1;
        visited[dyr] = 1;

        xr++;
      }

      // check minmax for X
      if (xl < minX) minX = xl + 1;
      if (xr > maxX) maxX = xr - 1;

      newY = el.y - el.dir;
      if (newY >= 0 && newY < h) {
        // add two scanning lines in the opposite direction (y - dir) if necessary
        if (xl < el.left)
          stack.push({ y: newY, left: xl, right: el.left, dir: -el.dir }); // from "new left" to "current left"
        if (el.right < xr)
          stack.push({ y: newY, left: el.right, right: xr, dir: -el.dir }); // from "current right" to "new right"
      }
      newY = el.y + el.dir;
      if (newY >= 0 && newY < h) {
        // add the scanning line in the direction (y + dir) if necessary
        if (xl < xr) stack.push({ y: newY, left: xl, right: xr, dir: el.dir }); // from "new left" to "new right"
      }
    }
    // check minmax for Y if necessary
    if (checkY) {
      if (el.y < minY) minY = el.y;
      if (el.y > maxY) maxY = el.y;
    }
  } while (stack.length > 0);

  return {
    data: result,
    width: image.width,
    height: image.height,
    bounds: {
      minX: minX,
      minY: minY,
      maxX: maxX,
      maxY: maxY,
    },
  };
}

// eslint-disable-next-line complexity
function floodFillWithBorders(image, px, py, colorThreshold, mask) {
  let c,
    x,
    newY,
    el,
    xr,
    xl,
    dy,
    dyl,
    dyr,
    checkY,
    data = image.data,
    w = image.width,
    h = image.height,
    bytes = image.bytes, // number of bytes in the color
    maxX = -1,
    minX = w + 1,
    maxY = -1,
    minY = h + 1,
    i = (py * w) + px, // start point index in the mask data
    result = new Uint8Array(w * h), // result mask
    visited = new Uint8Array(mask ? mask : w * h); // mask of visited points

  if (visited[i] === 1) return null;

  i *= bytes; // start point index in the image data
  let sampleColor = [data[i], data[i + 1], data[i + 2], data[i + 3]]; // start point color (sample)

  let stack = [{ y: py, left: px - 1, right: px + 1, dir: 1 }]; // first scanning line
  do {
    el = stack.shift(); // get line for scanning

    checkY = false;
    for (x = el.left + 1; x < el.right; x++) {
      dy = el.y * w;
      i = (dy + x) * bytes; // point index in the image data

      if (visited[dy + x] === 1) continue; // check whether the point has been visited

      checkY = true; // if the color of the new point(x,y) is similar to the sample color need to check minmax for Y

      result[dy + x] = 1; // mark a new point in mask
      visited[dy + x] = 1; // mark a new point as visited

      // compare the color of the sample
      c = data[i] - sampleColor[0]; // check by red
      if (c > colorThreshold || c < -colorThreshold) continue;
      c = data[i + 1] - sampleColor[1]; // check by green
      if (c > colorThreshold || c < -colorThreshold) continue;
      c = data[i + 2] - sampleColor[2]; // check by blue
      if (c > colorThreshold || c < -colorThreshold) continue;

      xl = x - 1;
      // walk to left side starting with the left neighbor
      while (xl > -1) {
        dyl = dy + xl;
        i = dyl * bytes; // point index in the image data
        if (visited[dyl] === 1) break; // check whether the point has been visited

        result[dyl] = 1;
        visited[dyl] = 1;
        xl--;

        // compare the color of the sample
        c = data[i] - sampleColor[0]; // check by red
        if (c > colorThreshold || c < -colorThreshold) break;
        c = data[i + 1] - sampleColor[1]; // check by green
        if (c > colorThreshold || c < -colorThreshold) break;
        c = data[i + 2] - sampleColor[2]; // check by blue
        if (c > colorThreshold || c < -colorThreshold) break;
      }
      xr = x + 1;
      // walk to right side starting with the right neighbor
      while (xr < w) {
        dyr = dy + xr;
        i = dyr * bytes; // index point in the image data
        if (visited[dyr] === 1) break; // check whether the point has been visited

        result[dyr] = 1;
        visited[dyr] = 1;
        xr++;

        // compare the color of the sample
        c = data[i] - sampleColor[0]; // check by red
        if (c > colorThreshold || c < -colorThreshold) break;
        c = data[i + 1] - sampleColor[1]; // check by green
        if (c > colorThreshold || c < -colorThreshold) break;
        c = data[i + 2] - sampleColor[2]; // check by blue
        if (c > colorThreshold || c < -colorThreshold) break;
      }

      // check minmax for X
      if (xl < minX) minX = xl + 1;
      if (xr > maxX) maxX = xr - 1;

      newY = el.y - el.dir;
      if (newY >= 0 && newY < h) {
        // add two scanning lines in the opposite direction (y - dir) if necessary
        if (xl < el.left)
          stack.push({ y: newY, left: xl, right: el.left, dir: -el.dir }); // from "new left" to "current left"
        if (el.right < xr)
          stack.push({ y: newY, left: el.right, right: xr, dir: -el.dir }); // from "current right" to "new right"
      }
      newY = el.y + el.dir;
      if (newY >= 0 && newY < h) {
        // add the scanning line in the direction (y + dir) if necessary
        if (xl < xr)
          stack.push({ y: newY, left: xl, right: xr, dir: el.dir }); // from "new left" to "new right"
      }
    }
    // check minmax for Y if necessary
    if (checkY) {
      if (el.y < minY) minY = el.y;
      if (el.y > maxY) maxY = el.y;
    }
  } while (stack.length > 0);

  return {
    data: result,
    width: image.width,
    height: image.height,
    bounds: {
      minX: minX,
      minY: minY,
      maxX: maxX,
      maxY: maxY,
    },
  };
}

// Create a binary mask on the image by color threshold
//  Algorithm: Scanline flood fill (http://en.wikipedia.org/wiki/Flood_fill)
//  @param {Object} image: {Uint8Array} data, {int} width, {int} height, {int} bytes
//  @param {int} x of start pixel
//  @param {int} y of start pixel
//  @param {int} color threshold
//  @param {Uint8Array} mask of visited points (optional)
//  @param {boolean} [includeBorders=false] indicate whether to include borders pixels
//  @return {Object} mask: {Uint8Array} data, {int} width, {int} height, {Object} bounds
//
function floodFill(image, px, py, colorThreshold, mask, includeBorders) {
  return includeBorders
    ? floodFillWithBorders(image, px, py, colorThreshold, mask)
    : floodFillWithoutBorders(image, px, py, colorThreshold, mask);
}

// Apply the gauss-blur filter to binary mask
//  Algorithms: http://blog.ivank.net/fastest-gaussian-blur.html
//  http://www.librow.com/articles/article-9
//  http://elynxsdk.free.fr/ext-docs/Blur/Fast_box_blur.pdf
//  @param {Object} mask: {Uint8Array} data, {int} width, {int} height, {Object} bounds
//  @param {int} blur radius
//  @return {Object} mask: {Uint8Array} data, {int} width, {int} height, {Object} bounds
//
function gaussBlur(mask, radius) {
  let i,
    k,
    k1,
    x,
    y,
    val,
    start,
    end,
    n = (radius * 2) + 1, // size of the pattern for radius-neighbors (from -r to +r with the center point)
    s2 = radius * radius,
    wg = new Float32Array(n), // weights
    total = 0, // sum of weights(used for normalization)
    w = mask.width,
    h = mask.height,
    data = mask.data,
    minX = mask.bounds.minX,
    maxX = mask.bounds.maxX,
    minY = mask.bounds.minY,
    maxY = mask.bounds.maxY;

  // calc gauss weights
  for (i = 0; i < radius; i++) {
    var dsq = (radius - i) * (radius - i);
    var ww = Math.exp(-dsq / (2.0 * s2)) / (2 * Math.PI * s2);
    wg[radius + i] = wg[radius - i] = ww;
    total += 2 * ww;
  }
  // normalization weights
  for (i = 0; i < n; i++) {
    wg[i] /= total;
  }

  let result = new Uint8Array(w * h), // result mask
    endX = radius + w,
    endY = radius + h;

  // walk through all source points for blur
  for (y = minY; y < maxY + 1; y++)
    for (x = minX; x < maxX + 1; x++) {
      val = 0;
      k = y * w + x; // index of the point
      start = radius - x > 0 ? radius - x : 0;
      end = endX - x < n ? endX - x : n; // Math.min((((w - 1) - x) + radius) + 1, n);
      k1 = k - radius;
      // walk through x-neighbors
      for (i = start; i < end; i++) {
        val += data[k1 + i] * wg[i];
      }
      start = radius - y > 0 ? radius - y : 0;
      end = endY - y < n ? endY - y : n; // Math.min((((h - 1) - y) + radius) + 1, n);
      k1 = k - (radius * w);
      // walk through y-neighbors
      for (i = start; i < end; i++) {
        val += data[k1 + (i * w)] * wg[i];
      }
      result[k] = val > 0.5 ? 1 : 0;
    }

  return {
    data: result,
    width: w,
    height: h,
    bounds: {
      minX: minX,
      minY: minY,
      maxX: maxX,
      maxY: maxY,
    },
  };
}

// Create a border index array of boundary points of the mask with radius-neighbors
//  @param {Object} mask: {Uint8Array} data, {int} width, {int} height, {Object} bounds
//  @param {int} blur radius
//  @param {Uint8Array} visited: mask of visited points (optional)
//  @return {Array} border index array of boundary points with radius-neighbors (only points need for blur)
//
// eslint-disable-next-line complexity
function createBorderForBlur(mask, radius, visited) {
  let x,
    i,
    j,
    y,
    k,
    k1,
    k2,
    w = mask.width,
    h = mask.height,
    data = mask.data,
    visitedData = new Uint8Array(data),
    minX = mask.bounds.minX,
    maxX = mask.bounds.maxX,
    minY = mask.bounds.minY,
    maxY = mask.bounds.maxY,
    len = w * h,
    temp = new Uint8Array(len), // auxiliary array to check uniqueness
    border = [], // only border points
    x0 = Math.max(minX, 1),
    x1 = Math.min(maxX, w - 2),
    y0 = Math.max(minY, 1),
    y1 = Math.min(maxY, h - 2);

  if (visited && visited.length > 0) {
    // copy visited points (only "black")
    for (k = 0; k < len; k++) {
      if (visited[k] === 1) visitedData[k] = 1;
    }
  }

  // walk through inner values except points on the boundary of the image
  for (y = y0; y < y1 + 1; y++)
    for (x = x0; x < x1 + 1; x++) {
      k = (y * w) + x;
      if (data[k] === 0) continue; // "white" point isn't the border
      k1 = k + w; // y + 1
      k2 = k - w; // y - 1
      // check if any neighbor with a "white" color
      if (
        visitedData[k + 1] === 0
        || visitedData[k - 1] === 0
        || visitedData[k1] === 0
        || visitedData[k1 + 1] === 0
        || visitedData[k1 - 1] === 0
        || visitedData[k2] === 0
        || visitedData[k2 + 1] === 0
        || visitedData[k2 - 1] === 0
      ) {
        // if (visitedData[k + 1] + visitedData[k - 1] +
        //    visitedData[k1] + visitedData[k1 + 1] + visitedData[k1 - 1] +
        //    visitedData[k2] + visitedData[k2 + 1] + visitedData[k2 - 1] == 8) continue;
        border.push(k);
      }
    }

  // walk through points on the boundary of the image if necessary
  // if the "black" point is adjacent to the boundary of the image, it is a border point
  if (minX == 0)
    for (y = minY; y < maxY + 1; y++)
      if (data[y * w] === 1) border.push(y * w);

  if (maxX == w - 1)
    for (y = minY; y < maxY + 1; y++)
      if (data[(y * w) + maxX] === 1) border.push((y * w) + maxX);

  if (minY == 0)
    for (x = minX; x < maxX + 1; x++) if (data[x] === 1) border.push(x);

  if (maxY == h - 1)
    for (x = minX; x < maxX + 1; x++)
      if (data[(maxY * w) + x] === 1) border.push((maxY * w) + x);

  let result = [], // border points with radius-neighbors
    start,
    end,
    endX = radius + w,
    endY = radius + h,
    n = (radius * 2) + 1; // size of the pattern for radius-neighbors (from -r to +r with the center point)

  len = border.length;
  // walk through radius-neighbors of border points and add them to the result array
  for (j = 0; j < len; j++) {
    k = border[j]; // index of the border point
    temp[k] = 1; // mark border point
    result.push(k); // save the border point
    x = k % w; // calc x by index
    y = (k - x) / w; // calc y by index
    start = radius - x > 0 ? radius - x : 0;
    end = endX - x < n ? endX - x : n; // Math.min((((w - 1) - x) + radius) + 1, n);
    k1 = k - radius;
    // walk through x-neighbors
    for (i = start; i < end; i++) {
      k2 = k1 + i;
      if (temp[k2] === 0) {
        // check the uniqueness
        temp[k2] = 1;
        result.push(k2);
      }
    }
    start = radius - y > 0 ? radius - y : 0;
    end = endY - y < n ? endY - y : n; // Math.min((((h - 1) - y) + radius) + 1, n);
    k1 = k - (radius * w);
    // walk through y-neighbors
    for (i = start; i < end; i++) {
      k2 = k1 + (i * w);
      if (temp[k2] === 0) {
        // check the uniqueness
        temp[k2] = 1;
        result.push(k2);
      }
    }
  }

  return result;
}

// Apply the gauss-blur filter ONLY to border points with radius-neighbors
//  Algorithms: http://blog.ivank.net/fastest-gaussian-blur.html
//  http://www.librow.com/articles/article-9
//  http://elynxsdk.free.fr/ext-docs/Blur/Fast_box_blur.pdf
//  @param {Object} mask: {Uint8Array} data, {int} width, {int} height, {Object} bounds
//  @param {int} blur radius
//  @param {Uint8Array} visited: mask of visited points (optional)
//  @return {Object} mask: {Uint8Array} data, {int} width, {int} height, {Object} bounds
//
function gaussBlurOnlyBorder(mask, radius, visited) {
  let border = createBorderForBlur(mask, radius, visited), // get border points with radius-neighbors
    ww,
    dsq,
    i,
    j,
    k,
    k1,
    x,
    y,
    val,
    start,
    end,
    n = (radius * 2) + 1, // size of the pattern for radius-neighbors (from -r to +r with center point)
    s2 = 2 * radius * radius,
    wg = new Float32Array(n), // weights
    total = 0, // sum of weights(used for normalization)
    w = mask.width,
    h = mask.height,
    data = mask.data,
    minX = mask.bounds.minX,
    maxX = mask.bounds.maxX,
    minY = mask.bounds.minY,
    maxY = mask.bounds.maxY,
    len = border.length;

  // calc gauss weights
  for (i = 0; i < radius; i++) {
    dsq = (radius - i) * (radius - i);
    ww = Math.exp(-dsq / s2) / Math.PI;
    wg[radius + i] = wg[radius - i] = ww;
    total += 2 * ww;
  }
  // normalization weights
  for (i = 0; i < n; i++) {
    wg[i] /= total;
  }

  let result = new Uint8Array(data), // copy the source mask
    endX = radius + w,
    endY = radius + h;

  // walk through all border points for blur
  for (i = 0; i < len; i++) {
    k = border[i]; // index of the border point
    val = 0;
    x = k % w; // calc x by index
    y = (k - x) / w; // calc y by index
    start = radius - x > 0 ? radius - x : 0;
    end = endX - x < n ? endX - x : n; // Math.min((((w - 1) - x) + radius) + 1, n);
    k1 = k - radius;
    // walk through x-neighbors
    for (j = start; j < end; j++) {
      val += data[k1 + j] * wg[j];
    }
    if (val > 0.5) {
      result[k] = 1;
      // check minmax
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      continue;
    }
    start = radius - y > 0 ? radius - y : 0;
    end = endY - y < n ? endY - y : n; // Math.min((((h - 1) - y) + radius) + 1, n);
    k1 = k - (radius * w);
    // walk through y-neighbors
    for (j = start; j < end; j++) {
      val += data[k1 + (j * w)] * wg[j];
    }
    if (val > 0.5) {
      result[k] = 1;
      // check minmax
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    } else {
      result[k] = 0;
    }
  }

  return {
    data: result,
    width: w,
    height: h,
    bounds: {
      minX: minX,
      minY: minY,
      maxX: maxX,
      maxY: maxY,
    },
  };
}

// Create a border mask (only boundary points)
//  @param {Object} mask: {Uint8Array} data, {int} width, {int} height, {Object} bounds
//  @return {Object} border mask: {Uint8Array} data, {int} width, {int} height, {Object} offset
//
// eslint-disable-next-line complexity
function createBorderMask(mask) {
  let x,
    y,
    k,
    k1,
    k2,
    w = mask.width,
    h = mask.height,
    data = mask.data,
    minX = mask.bounds.minX,
    maxX = mask.bounds.maxX,
    minY = mask.bounds.minY,
    maxY = mask.bounds.maxY,
    rw = maxX - minX + 1, // bounds size
    rh = maxY - minY + 1,
    result = new Uint8Array(rw * rh), // reduced mask (bounds size)
    x0 = Math.max(minX, 1),
    x1 = Math.min(maxX, w - 2),
    y0 = Math.max(minY, 1),
    y1 = Math.min(maxY, h - 2);

  // walk through inner values except points on the boundary of the image
  for (y = y0; y < y1 + 1; y++)
    for (x = x0; x < x1 + 1; x++) {
      k = (y * w) + x;
      if (data[k] === 0) continue; // "white" point isn't the border
      k1 = k + w; // y + 1
      k2 = k - w; // y - 1
      // check if any neighbor with a "white" color
      if (
        data[k + 1] === 0
        || data[k - 1] === 0
        || data[k1] === 0
        || data[k1 + 1] === 0
        || data[k1 - 1] === 0
        || data[k2] === 0
        || data[k2 + 1] === 0
        || data[k2 - 1] === 0
      ) {
        // if (data[k + 1] + data[k - 1] +
        //    data[k1] + data[k1 + 1] + data[k1 - 1] +
        //    data[k2] + data[k2 + 1] + data[k2 - 1] == 8) continue;
        result[((y - minY) * rw) + (x - minX)] = 1;
      }
    }

  // walk through points on the boundary of the image if necessary
  // if the "black" point is adjacent to the boundary of the image, it is a border point
  if (minX == 0)
    for (y = minY; y < maxY + 1; y++)
      if (data[y * w] === 1) result[(y - minY) * rw] = 1;

  if (maxX == w - 1)
    for (y = minY; y < maxY + 1; y++)
      if (data[(y * w) + maxX] === 1)
        result[((y - minY) * rw) + (maxX - minX)] = 1;

  if (minY == 0)
    for (x = minX; x < maxX + 1; x++) if (data[x] === 1) result[x - minX] = 1;

  if (maxY == h - 1)
    for (x = minX; x < maxX + 1; x++)
      if (data[(maxY * w) + x] === 1)
        result[((maxY - minY) * rw) + (x - minX)] = 1;

  return {
    data: result,
    width: rw,
    height: rh,
    offset: { x: minX, y: minY },
  };
}

// Create a border index array of boundary points of the mask
//  @param {Object} mask: {Uint8Array} data, {int} width, {int} height
//  @return {Array} border index array boundary points of the mask
//
function getBorderIndices(mask) {
  let x,
    y,
    k,
    k1,
    k2,
    w = mask.width,
    h = mask.height,
    data = mask.data,
    border = [], // only border points
    x1 = w - 1,
    y1 = h - 1;

  // walk through inner values except points on the boundary of the image
  for (y = 1; y < y1; y++)
    for (x = 1; x < x1; x++) {
      k = (y * w) + x;
      if (data[k] === 0) continue; // "white" point isn't the border
      k1 = k + w; // y + 1
      k2 = k - w; // y - 1
      // check if any neighbor with a "white" color
      if (
        data[k + 1] === 0
        || data[k - 1] === 0
        || data[k1] === 0
        || data[k1 + 1] === 0
        || data[k1 - 1] === 0
        || data[k2] === 0
        || data[k2 + 1] === 0
        || data[k2 - 1] === 0
      ) {
        // if (data[k + 1] + data[k - 1] +
        //    data[k1] + data[k1 + 1] + data[k1 - 1] +
        //    data[k2] + data[k2 + 1] + data[k2 - 1] == 8) continue;
        border.push(k);
      }
    }

  // walk through points on the boundary of the image if necessary
  // if the "black" point is adjacent to the boundary of the image, it is a border point
  for (y = 0; y < h; y++) if (data[y * w] === 1) border.push(y * w);

  for (x = 0; x < w; x++) if (data[x] === 1) border.push(x);

  k = w - 1;
  for (y = 0; y < h; y++) if (data[y * w + k] === 1) border.push((y * w) + k);

  k = (h - 1) * w;
  for (x = 0; x < w; x++) if (data[k + x] === 1) border.push(k + x);

  return border;
}

// Create a compressed mask with a "white" border (1px border with zero values) for the contour tracing
//  @param {Object} mask: {Uint8Array} data, {int} width, {int} height, {Object} bounds
//  @return {Object} border mask: {Uint8Array} data, {int} width, {int} height, {Object} offset
//
function prepareMask(mask) {
  let x,
    y,
    w = mask.width,
    data = mask.data,
    minX = mask.bounds.minX,
    maxX = mask.bounds.maxX,
    minY = mask.bounds.minY,
    maxY = mask.bounds.maxY,
    rw = maxX - minX + 3, // bounds size +1 px on each side (a "white" border)
    rh = maxY - minY + 3,
    result = new Uint8Array(rw * rh); // reduced mask (bounds size)

  // walk through inner values and copy only "black" points to the result mask
  for (y = minY; y < maxY + 1; y++)
    for (x = minX; x < maxX + 1; x++) {
      if (data[(y * w) + x] === 1)
        result[((y - minY + 1) * rw) + (x - minX + 1)] = 1;
    }

  return {
    data: result,
    width: rw,
    height: rh,
    offset: { x: minX - 1, y: minY - 1 },
  };
}

// Create a contour array for the binary mask
//  Algorithm: http://www.sciencedirect.com/science/article/pii/S1077314203001401
//  @param {Object} mask: {Uint8Array} data, {int} width, {int} height, {Object} bounds
//  @return {Array} contours: {Array} points, {bool} inner, {int} label
//
function traceContours(mask) {
  let m = prepareMask(mask),
    contours = [],
    label = 0,
    w = m.width,
    w2 = w * 2,
    h = m.height,
    src = m.data,
    dx = m.offset.x,
    dy = m.offset.y,
    dest = new Uint8Array(src), // label matrix
    i,
    j,
    x,
    y,
    k,
    k1,
    c,
    inner,
    dir,
    first,
    second,
    current,
    previous,
    next,
    d;

  // all [dx,dy] pairs (array index is the direction)
  // 5 6 7
  // 4 X 0
  // 3 2 1
  let directions = [
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [-1, -1],
    [0, -1],
    [1, -1],
  ];

  for (y = 1; y < h - 1; y++)
    for (x = 1; x < w - 1; x++) {
      k = (y * w) + x;
      if (src[k] === 1) {
        for (i = -w; i < w2; i += w2) {
          // k - w: outer tracing (y - 1), k + w: inner tracing (y + 1)
          if (src[k + i] === 0 && dest[k + i] === 0) {
            // need contour tracing
            inner = i === w; // is inner contour tracing ?
            label++; // label for the next contour

            c = [];
            dir = inner ? 2 : 6; // start direction
            current = previous = first = { x: x, y: y };
            second = null;
            while (true) {
              dest[(current.y * w) + current.x] = label; // mark label for the current point
              // bypass all the neighbors around the current point in a clockwise
              for (j = 0; j < 8; j++) {
                dir = (dir + 1) % 8;

                // get the next point by new direction
                d = directions[dir]; // index as direction
                next = { x: current.x + d[0], y: current.y + d[1] };

                k1 = (next.y * w) + next.x;
                if (src[k1] === 1) {
                  // black boundary pixel
                  dest[k1] = label; // mark a label
                  break;
                }
                dest[k1] = -1; // mark a white boundary pixel
                next = null;
              }
              if (next === null) break; // no neighbours (one-point contour)
              current = next;
              if (second) {
                if (
                  previous.x === first.x
                  && previous.y === first.y
                  && current.x === second.x
                  && current.y === second.y
                ) {
                  break; // creating the contour completed when returned to original position
                }
              } else {
                second = next;
              }
              c.push({ x: previous.x + dx, y: previous.y + dy });
              previous = current;
              dir = (dir + 4) % 8; // next dir (symmetrically to the current direction)
            }

            // eslint-disable-next-line max-depth
            if (next != null) {
              c.push({ x: first.x + dx, y: first.y + dy }); // close the contour
              contours.push({ inner: inner, label: label, points: c }); // add contour to the list
            }
          }
        }
      }
    }

  return contours;
}

// Simplify contours
//  Algorithms: http://psimpl.sourceforge.net/douglas-peucker.html
//  http://neerc.ifmo.ru/wiki/index.php?title=%D0%A3%D0%BF%D1%80%D0%BE%D1%89%D0%B5%D0%BD%D0%B8%D0%B5_%D0%BF%D0%BE%D0%BB%D0%B8%D0%B3%D0%BE%D0%BD%D0%B0%D0%BB%D1%8C%D0%BD%D0%BE%D0%B9_%D1%86%D0%B5%D0%BF%D0%B8
//  @param {Array} contours: {Array} points, {bool} inner, {int} label
//  @param {float} simplify tolerant
//  @param {int} simplify count: min number of points when the contour is simplified
//  @return {Array} contours: {Array} points, {bool} inner, {int} label, {int} initialCount
//
function simplifyContours(contours, simplifyTolerant, simplifyCount) {
  let lenContours = contours.length,
    result = [],
    i,
    j,
    k,
    c,
    points,
    len,
    resPoints,
    lst,
    stack,
    ids,
    maxd,
    maxi,
    dist,
    r1,
    r2,
    r12,
    dx,
    dy,
    pi,
    pf,
    pl;

  // walk through all contours
  for (j = 0; j < lenContours; j++) {
    c = contours[j];
    points = c.points;
    len = c.points.length;

    if (len < simplifyCount) {
      // contour isn't simplified
      resPoints = [];
      for (k = 0; k < len; k++) {
        resPoints.push({ x: points[k].x, y: points[k].y });
      }
      result.push({
        inner: c.inner,
        label: c.label,
        points: resPoints,
        initialCount: len,
      });
      continue;
    }

    lst = [0, len - 1]; // always add first and last points
    stack = [{ first: 0, last: len - 1 }]; // first processed edge

    do {
      ids = stack.shift();
      if (ids.last <= ids.first + 1) {
        // no intermediate points
        continue;
      }

      maxd = -1.0; // max distance from point to current edge
      maxi = ids.first; // index of maximally distant point

      for (
        i = ids.first + 1;
        i < ids.last;
        i++ // bypass intermediate points in edge
      ) {
        // calc the distance from current point to edge
        pi = points[i];
        pf = points[ids.first];
        pl = points[ids.last];
        dx = pi.x - pf.x;
        dy = pi.y - pf.y;
        r1 = Math.sqrt((dx * dx) + (dy * dy));
        dx = pi.x - pl.x;
        dy = pi.y - pl.y;
        r2 = Math.sqrt((dx * dx) + (dy * dy));
        dx = pf.x - pl.x;
        dy = pf.y - pl.y;
        r12 = Math.sqrt((dx * dx) + (dy * dy));
        if (r1 >= Math.sqrt((r2 * r2) + (r12 * r12))) dist = r2;
        else if (r2 >= Math.sqrt((r1 * r1) + (r12 * r12))) dist = r1;
        else
          dist = Math.abs(
            ((dy * pi.x) - (dx * pi.y) + (pf.x * pl.y) - (pl.x * pf.y)) / r12
          );

        if (dist > maxd) {
          maxi = i; // save the index of maximally distant point
          maxd = dist;
        }
      }

      if (maxd > simplifyTolerant) {
        // if the max "deviation" is larger than allowed then...
        lst.push(maxi); // add index to the simplified list
        stack.push({ first: ids.first, last: maxi }); // add the left part for processing
        stack.push({ first: maxi, last: ids.last }); // add the right part for processing
      }
    } while (stack.length > 0);

    resPoints = [];
    len = lst.length;
    lst.sort((a, b) => {
      return a - b;
    }); // restore index order
    for (k = 0; k < len; k++) {
      resPoints.push({ x: points[lst[k]].x, y: points[lst[k]].y }); // add result points to the correct order
    }
    result.push({
      inner: c.inner,
      label: c.label,
      points: resPoints,
      initialCount: c.points.length,
    });
  }

  return result;
}

const MagicWand = {
  floodFill: floodFill.bind(),
  gaussBlur: gaussBlur.bind(),
  gaussBlurOnlyBorder: gaussBlurOnlyBorder.bind(),
  createBorderMask: createBorderMask.bind(),
  getBorderIndices: getBorderIndices.bind(),
  traceContours: traceContours.bind(),
  simplifyContours: simplifyContours.bind(),
};

/* harmony default export */ const vendor_MagicWand = (MagicWand);

;// CONCATENATED MODULE: ./src/tokenizer/MagicLasso.js
/* eslint-disable no-continue */




class MagicLasso {

  #createBaseCanvas() {
    this.canvas = document.createElement("canvas");
    this.canvas.id = "base-canvas";
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.context = this.canvas.getContext("2d");
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  #drawChequeredBackground(width = 7) {
    this.chequeredSource = document.createElement("canvas");
    this.chequeredSource.id = "chequered-canvas";
    this.chequeredSource.width = this.width;
    this.chequeredSource.height = this.height;
    
    const context = this.chequeredSource.getContext("2d");
    const columns = Math.ceil(this.chequeredSource.width / width);
    const rows = Math.ceil(this.chequeredSource.height / width);

    context.fillStyle = "rgb(212, 163, 19)";
    for (let i = 0; i < rows; ++i) {
      for (let j = 0, col = columns / 2; j < col; ++j) {
        context.rect(
          (2 * j * width) + (i % 2 ? 0 : width),
          i * width,
          width,
          width,
        );
      }
    }
    context.fill();
  }

  #drawLayerCanvas() {
    this.layerCanvas = document.createElement("canvas");
    this.layerCanvas.id = "layer-canvas";
    this.layerCanvas.width = this.width;
    this.layerCanvas.height = this.height;
    this.layerContext = this.layerCanvas.getContext("2d");
    this.layerContext
      .drawImage(
        this.layer.source,
        0,
        0,
        this.layer.source.width,
        this.layer.source.height,
        this.yOffset,
        this.xOffset,
        this.scaledWidth,
        this.scaledHeight,
      );
  }

  #setData() {
    this.data = this.layerContext.getImageData(
      0,
      0,
      this.canvas.width,
      this.canvas.height,
    );
  }

  #colorPicker() {
    // a nicer looking proxy for the color picker
    this.colorSelector = document.getElementById("magic-lasso-color-selector");
    this.colorSelectorProxy = document.getElementById("magic-lasso-color-selector-proxy");

    this.colorSelectorProxy.addEventListener("click", () => {
      this.colorSelector.click();
    });

    // listen to the color Selector onChange Event to update the layer's background color
    this.colorSelector.addEventListener('change', (event) => {
      this.colorSelectorProxy.style.backgroundColor = event.target.value;
      this.colorSelectorProxy.classList.remove('transparent');
      const button = document.getElementById("lasso-fill");
      button.disabled = false;
      this.fillColor = event.target.value;
    });
  }

  constructor(layer) {
    this.container = null;
    this.layer = layer;

    this.height = Math.min(1000, layer.source.height, layer.source.width);
    this.width = Math.min(1000, layer.source.height, layer.source.width);

    const crop = game.settings.get(constants.MODULE_ID, "default-crop-image");
    // if we crop the image we scale to the smallest dimension of the image
    // otherwise we scale to the largest dimension of the image
    const direction = crop ? layer.source.height > layer.source.width : layer.source.height < layer.source.width;

    this.scaledWidth = !direction
      ? this.height * (layer.source.height / layer.source.width)
      : this.width;
    this.scaledHeight = direction
      ? this.width * (layer.source.height / layer.source.width)
      : this.height;

    // offset the canvas for the scaled image
    this.yOffset = (this.width - this.scaledWidth) / 2;
    this.xOffset = (this.height - this.scaledHeight) / 2;

    this.data = null;
    this.mask = null;
    this.oldMask = null;
    this.context = null;

    // create base canvases
    this.#drawChequeredBackground();
    this.#drawLayerCanvas();
    this.#createBaseCanvas();
    this.#setData();

    // magic laso vars
    this.colorThreshold = 15;
    this.blurRadius = 5;
    this.simplifyCount = 30;
    this.hatchLength = 4;
    this.hatchOffset = 0;
    this.fillColor = "f59042";

    this.cacheInd = null;
    this.downPoint = null;
    this.allowDraw = false;
    this.addMode = false;
    this.currentThreshold = this.colorThreshold;

    this.canvasChanged = false;

  }

  async display(callback, nestedCallback) {
    const html = await renderTemplate("modules/vtta-tokenizer/templates/magic-lasso.hbs");
    this.container = $(html);
    this.wrapper = document.createElement('div');
    this.wrapper.classList.add('magic-lasso-wrapper');
    this.wrapper.appendChild(this.chequeredSource);
    this.wrapper.appendChild(this.layerCanvas);
    this.wrapper.appendChild(this.canvas);
    this.container[0].append(this.wrapper);
    $("body").append(this.container);
    this.#activateListeners(callback, nestedCallback);

    this.#colorPicker();
    this.showThreshold();
    this.showBlur();
    this.mask = null;

    this.interval = setInterval(() => {
      this.hatchTick();
    }, 300);
  }

  #activateListeners(callback, nestedCallback) {

    this.callbacks = {
      callback,
      nestedCallback,
    };

    window.addEventListener("keyup", this.onKeyUp.bind(this));
    window.addEventListener("keydown", this.onKeyDown.bind(this));

    const wrapper = document.getElementById("magic-lasso-buttons");
    wrapper.addEventListener("click", (event) => {
      if (event.target.nodeName === 'BUTTON') {
        this.clickButton(event);
      }
    });

    const blurRadius = document.getElementById("tokenizer-blur-radius");
    blurRadius.addEventListener("onchange", (event) => {
      this.onRadiusChange(event);
    });

    this.canvas.addEventListener("mouseup", this.onMouseUp.bind(this));
    this.canvas.addEventListener("mousedown", this.onMouseDown.bind(this));
    this.canvas.addEventListener("mousemove", this.onMouseMove.bind(this));

  }

  // eslint-disable-next-line consistent-return
  #saveAndCleanup(action) {
    clearInterval(this.interval);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("keydown", this.onKeyDown);
    this.container.remove();

    if (action === "ok" && this.canvasChanged) {
      const source = Utils.cloneCanvas(this.layer.source);
      // rescale the mask back up for the appropriate layer canvas size
      const context = source.getContext("2d");
      context.resetTransform();
      context.clearRect(0, 0, source.width, source.height);
      source.getContext("2d").drawImage(
        this.layerCanvas,
        this.yOffset,
        this.xOffset,
        this.scaledWidth,
        this.scaledHeight,
        0,
        0,
        this.layer.source.width,
        this.layer.source.height,
      );
      return this.callbacks.callback(source, this.callbacks.nestedCallback);
    }
  }

  clickButton(event) {
    event.preventDefault();
    const action = event.data?.action ?? event.target?.dataset?.action;

    if (action === "ok" || action === "cancel") {
      this.#saveAndCleanup(action);
    } else if (action === "fill") {
      this.fill(1);
    } else if (action === "delete") {
      this.fill(0);
    }
  }

  hatchTick() {
    this.hatchOffset = (this.hatchOffset + 1) % (this.hatchLength * 2);
    this.drawBorder(true);
  }

  onRadiusChange(event) {
    this.blurRadius = event.target.value;
    this.showBlur();
  }

  #getMousePointer(event) {
    const realPoint = Utils.getCanvasCords(this.layerCanvas, event);
    return {
      x: Math.floor(realPoint.x),
      y: Math.floor(realPoint.y),
    };
  }

  onMouseDown(event) {
    if (event.button == 0) {
      this.allowDraw = true;
      this.addMode = event.ctrlKey;
      this.downPoint = this.#getMousePointer(event);
      this.drawMask(this.downPoint.x, this.downPoint.y);
    } else {
      this.allowDraw = false;
      this.addMode = false;
      this.oldMask = null;
    }
  }

  onMouseMove(event) {
    if (this.allowDraw) {
      const p = this.#getMousePointer(event);
      if (p.x != this.downPoint.x || p.y != this.downPoint.y) {
        let dx = p.x - this.downPoint.x,
          dy = p.y - this.downPoint.y,
          len = Math.sqrt((dx * dx) + (dy * dy)),
          adx = Math.abs(dx),
          ady = Math.abs(dy),
          sign = adx > ady ? dx / adx : dy / ady;
        sign = sign < 0 ? sign / 5 : sign / 3;
        let threshold = Math.min(
          Math.max(this.colorThreshold + Math.floor(sign * len), 1),
          255,
        );
        if (threshold != this.currentThreshold) {
          this.currentThreshold = threshold;
          this.drawMask(this.downPoint.x, this.downPoint.y);
        }
      }
    }
  }

  onMouseUp() {
    this.allowDraw = false;
    this.addMode = false;
    this.oldMask = null;
    this.currentThreshold = this.colorThreshold;
  }

  onKeyDown(event) {
    if (event.keyCode == 17) this.canvas.classList.add("add-mode");
  }

  // eslint-disable-next-line consistent-return
  onKeyUp(event) {
    switch (event.keyCode) {
      // ctrl
      case 17:
        this.canvas.classList.remove("add-mode");
        break;
      // f
      case 70:
        this.fill(1);
        break;
      // delete
      case 68:
      case 46:
      case 8: 
        this.fill(0);
        break;
      // enter
      case 13:
        this.#saveAndCleanup("ok");
        break;
      // escape
      case 27:
        this.#saveAndCleanup("cancel");
        break;
      // no default
    }
  }

  showThreshold() {
    document.getElementById("tokenizer-threshold").innerHTML = `Threshold: ${this.currentThreshold}`;
  }

  showBlur() {
    document.getElementById("tokenizer-blur-radius").value = this.blurRadius;
  }

  drawMask(x, y) {
    if (!this.data) return;

    this.showThreshold();

    let image = {
      data: this.data.data,
      width: this.canvas.width,
      height: this.canvas.height,
      bytes: 4,
    };

    if (this.addMode && !this.oldMask) {
      this.oldMask = this.mask;
    }

    let old = this.oldMask ? this.oldMask.data : null;
    this.mask = vendor_MagicWand.floodFill(image, x, y, this.currentThreshold, old, true);

    if (this.mask) this.mask = vendor_MagicWand.gaussBlurOnlyBorder(this.mask, this.blurRadius, old);

    if (this.addMode && this.oldMask) {
      this.mask = this.mask ? MagicLasso.concatMasks(this.mask, this.oldMask) : this.oldMask;
    }

    this.drawBorder();
  }

  drawBorder(noBorder) {
    if (!this.mask) return;

    let x,
      y,
      i,
      j,
      k,
      width = this.canvas.width,
      height = this.canvas.height;

    let imageData = this.layerContext.createImageData(width, height);

    if (!noBorder) this.cacheInd = vendor_MagicWand.getBorderIndices(this.mask);

    this.context.clearRect(0, 0, width, height);

    const len = this.cacheInd.length;
    for (j = 0; j < len; j++) {
      i = this.cacheInd[j];
      x = i % width; // calc x by index
      y = (i - x) / width; // calc y by index
      k = ((y * width) + x) * 4;
      if ((x + y + this.hatchOffset) % (this.hatchLength * 2) < this.hatchLength) {
        // detect hatch color
        imageData.data[k + 3] = 255; // black, change only alpha
      } else {
        imageData.data[k] = 255; // white
        imageData.data[k + 1] = 255;
        imageData.data[k + 2] = 255;
        imageData.data[k + 3] = 255;
      }
    }

    this.context.putImageData(imageData, 0, 0);
  }

  trace() {
    let cs = vendor_MagicWand.traceContours(this.mask);
    cs = vendor_MagicWand.simplifyContours(cs, this.simplifyTolerant, this.simplifyCount);

    this.mask = null;

    // draw contours
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    // inner
    this.context.beginPath();
    for (let i = 0; i < cs.length; i++) {
      if (!cs[i].inner) continue;
      let ps = cs[i].points;
      this.context.moveTo(ps[0].x, ps[0].y);
      for (let j = 1; j < ps.length; j++) {
        this.context.lineTo(ps[j].x, ps[j].y);
      }
    }
    this.context.strokeStyle = "red";
    this.context.stroke();
    // outer
    this.context.beginPath();
    for (let i = 0; i < cs.length; i++) {
      if (cs[i].inner) continue;
      let ps = cs[i].points;
      this.context.moveTo(ps[0].x, ps[0].y);
      for (let j = 1; j < ps.length; j++) {
        this.context.lineTo(ps[j].x, ps[j].y);
      }
    }
    this.context.strokeStyle = "blue";
    this.context.stroke();
  }

  static hexToRgb(hex, alpha) {
    const int = parseInt(hex.replace(/^#/, ""), 16);
    // eslint-disable-next-line no-bitwise
    const r = (int >> 16) & 255;
    // eslint-disable-next-line no-bitwise
    const g = (int >> 8) & 255;
    // eslint-disable-next-line no-bitwise
    const b = int & 255;
  
    return [r, g, b, Math.round(alpha * 255)];
  }

  fill(alpha = 0.35) {
    if (!this.mask) return;

    const fullAlpha = (alpha === 0);
    const rgba = MagicLasso.hexToRgb(this.fillColor, alpha);

    let x,
      y,
      data = this.mask.data,
      bounds = this.mask.bounds,
      maskW = this.mask.width,
      width = this.canvas.width,
      height = this.canvas.height,
      imgData = this.layerContext.getImageData(0, 0, width, height);

    for (y = bounds.minY; y <= bounds.maxY; y++) {
      for (x = bounds.minX; x <= bounds.maxX; x++) {
        if (data[(y * maskW) + x] == 0) continue;
        const k = ((y * width) + x) * 4;
        imgData.data[k] = fullAlpha ? 0 : rgba[0];
        imgData.data[k + 1] = fullAlpha ? 0 : rgba[1];
        imgData.data[k + 2] = fullAlpha ? 0 : rgba[2];
        imgData.data[k + 3] = fullAlpha ? 0 : rgba[3];
      }
    }

    this.mask = null;
  
    this.context.clearRect(0, 0, width, height);
    this.layerContext.putImageData(imgData, 0, 0);
    this.canvasChanged = true;
  }

  static concatMasks(mask, old) {
    let data1 = old.data,
      data2 = mask.data,
      w1 = old.width,
      w2 = mask.width,
      b1 = old.bounds,
      b2 = mask.bounds,
      b = {
        // bounds for new mask
        minX: Math.min(b1.minX, b2.minX),
        minY: Math.min(b1.minY, b2.minY),
        maxX: Math.max(b1.maxX, b2.maxX),
        maxY: Math.max(b1.maxY, b2.maxY),
      },
      w = old.width, // size for new mask
      h = old.height,
      i,
      j,
      k,
      k1,
      k2,
      len;
  
    let result = new Uint8Array(w * h);
  
    // copy all old mask
    len = b1.maxX - b1.minX + 1;
    i = (b1.minY * w) + b1.minX;
    k1 = (b1.minY * w1) + b1.minX;
    k2 = (b1.maxY * w1) + b1.minX + 1;
    // walk through rows (Y)
    for (k = k1; k < k2; k += w1) {
      result.set(data1.subarray(k, k + len), i); // copy row
      i += w;
    }
  
    // copy new mask (only "black" pixels)
    len = b2.maxX - b2.minX + 1;
    i = (b2.minY * w) + b2.minX;
    k1 = (b2.minY * w2) + b2.minX;
    k2 = (b2.maxY * w2) + b2.minX + 1;
    // walk through rows (Y)
    for (k = k1; k < k2; k += w2) {
      // walk through cols (X)
      for (j = 0; j < len; j++) {
        if (data2[k + j] === 1) result[i + j] = 1;
      }
      i += w;
    }
  
    return {
      data: result,
      width: w,
      height: h,
      bounds: b,
    };
  }

}

;// CONCATENATED MODULE: ./src/tokenizer/Layer.js









class Layer {

  resetMasks() {
    this.customMaskLayers = false;
    this.appliedMaskIds.clear();
    this.view.layers.forEach((l) => {
      if (l.providesMask && this.view.isOriginLayerHigher(l.id, this.id)) {
        this.appliedMaskIds.add(l.id);
      }
    });
    this.compositeOperation = constants.BLEND_MODES.SOURCE_OVER;
    this.maskCompositeOperation = constants.BLEND_MODES.SOURCE_IN;
    this.customMask = false;
    this.mask = this.sourceMask ? Utils.cloneCanvas(this.sourceMask) : null;
    this.redraw();
  }

  reset() {
    this.source = Utils.cloneCanvas(this.original);
    this.alphaPixelColors.clear();
    this.resetMasks();
    this.scale = this.width / Math.max(this.source.width, this.source.height);
    this.rotation = 0;
    this.position.x = Math.floor((this.width / 2) - ((this.source.width * this.scale) / 2));
    this.position.y = Math.floor((this.height / 2) - ((this.source.height * this.scale) / 2));
    this.mask = null;
    this.redraw();
    if (this.providesMask) this.createMask();
    this.recalculateMask();
  }

  constructor({ view, canvas, tintColor, tintLayer, img = null, color = null, maskFromImage = false, visible = true } = {}) {
    this.view = view;
    this.id = Utils.generateUUID();
    this.canvas = canvas;
    // keep a copy of the source to work transforms from
    this.source = Utils.cloneCanvas(this.canvas);
    // canvas referencing to the source (image) that will be displayed on the view canvas
    this.preview = Utils.cloneCanvas(this.canvas);
    // for reset purposes
    this.original = Utils.cloneCanvas(this.canvas);

    // the current position of the source image on the view canvas
    this.position = {
      x: 0,
      y: 0,
    };

    // the current scale, will be calculated once an image is loaded into the view canvas
    this.scale = 1;

    // the current degree of rotation
    this.rotation = 0;

    // mirror
    this.center = { x: this.canvas.width / 2, y: this.canvas.height / 2 };
    this.mirror = 1;
    this.flipped = false;

    // the image drawn on the source, kept for rotations
    if (img) {
      this.img = img;
      this.sourceImg = img.src;
    }

    // active layers allow mouse events to be followed (scale/translate)
    this.active = false;

    // source mask is the mask generated by the source image, and mask can be another mask
    // from another layer
    this.providesMask = false;
    this.renderedMask = document.createElement('canvas');
    this.renderedMask.width = this.source.width;
    this.renderedMask.height = this.source.height;
    this.mask = null;
    this.sourceMask = null;
    this.maskCompositeOperation = constants.BLEND_MODES.SOURCE_IN;
    this.customMask = false;
    this.maskFromImage = maskFromImage;

    // mask ids to apply to this layer
    this.appliedMaskIds = new Set();
    this.customMaskLayers = false;

    this.alpha = 1.0;
    this.compositeOperation = constants.BLEND_MODES.SOURCE_OVER;
    this.visible = visible;

    // initialize with color
    this.previousColor = null;
    this.color = color;
    this.colorLayer = color !== null;

    // extra alpha pixels
    this.previousAlphaPixelColors = null;
    this.alphaPixelColors = new Set();

    // tint the layer?
    this.tintLayer = tintLayer;
    this.tintColor = tintColor;
    // this.tintColor = "#f59042";
  }

  static fromLayer(layer) {
    const newLayer = new Layer({
      view: layer.view,
      canvas: Utils.cloneCanvas(layer.canvas),
      img: layer.img,
      tintColor: layer.tintColor,
      tintLayer: layer.tintLayer,
      maskFromImage: layer.maskFromImage,
      visible: layer.visible,
      color: layer.color,
    });

    newLayer.colorLayer = layer.colorLayer;
    newLayer.source = Utils.cloneCanvas(layer.source);
    newLayer.canvas = Utils.cloneCanvas(layer.canvas);
    newLayer.preview = Utils.cloneCanvas(layer.preview);
    newLayer.original = Utils.cloneCanvas(layer.original);

    newLayer.providesMask = layer.providesMask;

    newLayer.scale = layer.scale;
    newLayer.rotation = layer.rotation;
    newLayer.position = foundry.utils.deepClone(layer.position);
    newLayer.center = layer.center;
    newLayer.mirror = layer.mirror;
    newLayer.flipped = layer.flipped;
    newLayer.visible = layer.visible;
    newLayer.alpha = layer.alpha;

    if (layer.mask) newLayer.mask = Utils.cloneCanvas(layer.mask);
    if (layer.sourceMask) layer.sourceMask = Utils.cloneCanvas(layer.sourceMask);
    if (layer.renderedMask) layer.renderedMask = Utils.cloneCanvas(layer.renderedMask);
    newLayer.customMask = layer.customMask;
    newLayer.customMaskLayers = layer.customMaskLayers;
    newLayer.appliedMaskIds = new Set(layer.appliedMaskIds);

    newLayer.compositeOperation = layer.compositeOperation;
    newLayer.maskCompositeOperation = layer.maskCompositeOperation;
    newLayer.maskFromImage = layer.maskFromImage;

    newLayer.alphaPixelColors = new Set(layer.alphaPixelColors);
    if (layer.previousAlphaPixelColors) newLayer.previousAlphaPixelColors = new Set(layer.previousAlphaPixelColors);

    newLayer.redraw();
    return newLayer;

  }

  clone() {
    const newLayer = Layer.fromLayer(this);
    return newLayer;
  }

  static isTransparent(pixels, x, y) {
    return constants.TRANSPARENCY_THRESHOLD < pixels.data[(((y * pixels.width) + x) * 4) + 3];
  }

  getLayerLabel(active = false) {
    const index = this.view.layers.findIndex((layer) => layer.id === this.id);

    if (index === -1) return "?";
    if (active) {
      return constants.NUMBERS.ACTIVE[index];
    } else {
      return constants.NUMBERS.INACTIVE[index];
    }
  }

  applyCustomMask(mask, callback) {
    this.customMask = true;
    this.mask = mask;
    const maskContext = this.renderedMask.getContext('2d');
    maskContext.resetTransform();
    maskContext.clearRect(0, 0, this.canvas.width, this.canvas.height);
    maskContext.drawImage(this.mask, 0, 0, this.canvas.width, this.canvas.height);
    callback(true);
  }

  editMask(callback) {
    const maskEditor = new Masker(this);
    maskEditor.display(this.applyCustomMask.bind(this), callback).then(() => {
      maskEditor.draw();
    });
  }

  applyMagicLasso(canvas, callback) {
    this.source = canvas;
    callback(true);
  }

  magicLasso(callback) {
    const magicLasso = new MagicLasso(this);
    magicLasso.display(this.applyMagicLasso.bind(this), callback);
  }

  /**
   * Activates the event listeners on the view canvas for scaling and translating
   */
  activate() {
    this.active = true;
  }

  /**
   * Deactivates the event listeners on the view canvas for scaling and translating (color picking is always active)
   */
  deactivate() {
    this.active = false;
  }

  isCompletelyTransparent() {
    const pixels = this.source.getContext('2d').getImageData(0, 0, this.source.width, this.source.height).data;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index + 3] > constants.TRANSPARENCY_THRESHOLD) {
        return false;
      }
    }

    return true;
  }

  isCompletelyOpaque() {
    const pixels = this.source.getContext('2d').getImageData(0, 0, this.source.width, this.source.height).data;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index + 3] < constants.TRANSPARENCY_THRESHOLD) {
        return false;
      }
    }
    return true;
  }

  /**
   * Creates a mask using the marching squares algorithm by walking the edges of the non-transparent pixels to find a contour.
   * Works naturally best for token images which have a circular ring-shape. The algorithm walks the contour and fills the inner regions with black, too
   * The mask is not active on creating, it is controlled by
   *
   * this.applyMask(mask | null), see above
   */
  createOriginalMask() {
    // create intermediate canvas
    const temp = document.createElement('canvas');
    // create a canvas that has at least a 1px transparent border all around
    // so the marching squares algorithm won't run endlessly
    temp.width = constants.MASK_DENSITY + 2;
    temp.height = constants.MASK_DENSITY + 2;
    temp.getContext('2d').drawImage(this.canvas, 1, 1, this.canvas.width, this.canvas.height, 1, 1, constants.MASK_DENSITY, constants.MASK_DENSITY);

    // get the pixel data from the source image
    let context = temp.getContext('2d');
    const pixels = context.getImageData(0, 0, constants.MASK_DENSITY + 2, constants.MASK_DENSITY + 2);

    // re-use the intermediate canvas
    const defaultFillColor = game.settings.get(constants.MODULE_ID, "default-color");
    if (defaultFillColor !== "") context.fillStyle = defaultFillColor;
    context.strokeStyle = '#000000AA';
    context.lineWidth = 1;
    context.fillStyle = "black";

    // the mask is totally transparent
    if (this.isCompletelyTransparent()) {
      context.clearRect(0, 0, temp.width, temp.height);
    } else if (this.isCompletelyOpaque()) {
      context.clearRect(0, 0, temp.width, temp.height);
      context.fillRect(0, 0, temp.width, temp.height);
      context.fill();
    } else {
      // process the pixel data
      const points = geom.contour((x, y) => Layer.isTransparent(pixels, x, y));
      context.clearRect(0, 0, temp.width, temp.height);
      context.beginPath();
      context.moveTo(points[0][0], points[0][4]);
      for (let i = 1; i < points.length; i++) {
        const point = points[i];
        context.lineTo(point[0], point[1]);
      }
      context.closePath();
      context.fill();
    }

    return temp;
  }

  createMaskFromImage() {
    const mask = document.createElement("canvas");
    mask.width = this.canvas.width;
    mask.height = this.canvas.height;

    mask
      .getContext('2d')
      .drawImage(this.canvas, 0, 0, this.canvas.width, this.canvas.height);

    const context = mask.getContext("2d");
    context.fillStyle = "black";
    context.globalCompositeOperation = "source-in";
    // context.globalCompositeOperation = "destination-over";
    context.fillRect(0, 0, mask.width, mask.height);

    return mask;
  }

  createMask() {
    if (!this.renderedMask) {
      this.renderedMask = document.createElement('canvas');
      this.renderedMask.width = this.source.width;
      this.renderedMask.height = this.source.height;
    }
    const rayMask = game.settings.get(constants.MODULE_ID, "default-algorithm");
    this.mask = this.maskFromImage
      ? this.createMaskFromImage()
      : rayMask
        ? generateRayMask(this.canvas)
        : this.createOriginalMask();
    const maskContext = this.renderedMask.getContext('2d');
    maskContext.resetTransform();
    maskContext.drawImage(this.mask, 0, 0, this.canvas.width, this.canvas.height);

    this.sourceMask = Utils.cloneCanvas(this.mask);
  }

  static fromImage({ view, img, canvasHeight, canvasWidth, tintColor, tintLayer, maskFromImage, visible } = {}) {
    const height = Math.max(1000, canvasHeight, img.naturalHeight, img.naturalWidth);
    const width = Math.max(1000, canvasWidth, img.naturalHeight, img.naturalWidth);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const crop = game.settings.get(constants.MODULE_ID, "default-crop-image");
    // if we crop the image we scale to the smallest dimension of the image
    // otherwise we scale to the largest dimension of the image
    const direction = crop ? img.naturalHeight > img.naturalWidth : img.naturalHeight < img.naturalWidth;

    const scaledWidth = !direction
      ? height * (img.width / img.height)
      : width;
    const scaledHeight = direction
      ? width * (img.height / img.width)
      : height;

    // offset the canvas for the scaled image
    const yOffset = (width - scaledWidth) / 2;
    const xOffset = (height - scaledHeight) / 2;

    const context = canvas.getContext("2d");
    context.drawImage(
        img,
        0,
        0,
        img.naturalWidth,
        img.naturalHeight,
        yOffset,
        xOffset,
        scaledWidth,
        scaledHeight,
      );

    const layer = new Layer({ view, canvas, img, tintColor, tintLayer, maskFromImage, visible });
    // layer.createMask();
    layer.redraw();
    return layer;
  }

  /**
   * Sets the background color for this layer. It will be masked, too
   * @param {color} hexColorString
   */
  setColor(hexColorString = null) {
    if (!this.colorLayer) return;
    this.color = hexColorString;
    const context = this.canvas.getContext("2d");
    context.fillStyle = hexColorString;
    context.rect(0, 0, this.width, this.height);
    context.fill();
    this.source = Utils.cloneCanvas(this.canvas);
  }

  static fromColor({ view, color, width, height } = {}) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const layer = new Layer({ view, canvas, color });
    layer.setColor(color);
    return layer;
  }

  saveColor() {
    this.previousColor = this.color;
  }

  restoreColor() {
    this.setColor(this.previousColor);
  }

  saveAlphas() {
    this.previousAlphaPixelColors = new Set(this.alphaPixelColors);
  }

  restoreAlphas() {
    this.alphaPixelColors = new Set(this.previousAlphaPixelColors);
  }

  /**
   * Gets the width of the view canvas
   */
  get width() {
    return this.canvas.width;
  }

  /**
   * Gets the height of the view canvas
   */
  get height() {
    return this.canvas.height;
  }

  /**
   * Translates the source on the view canvas
   * @param {Number} dx translation on the x-axis
   * @param {Number} dy translation on the y-axis
   */
  translate(dx, dy) {
    this.position.x -= dx;
    this.position.y -= dy;
    // this.redraw();
  }

  centre() {
    this.position.x = Math.floor((this.width / 2) - ((this.source.width * this.scale) / 2));
    this.position.y = Math.floor((this.height / 2) - ((this.source.height * this.scale) / 2));
    // this.redraw();
  }

  rotate(degree) {
    this.rotation += degree * 2;
  }

  flip() {
    this.mirror *= -1;
    this.flipped = !this.flipped;
    this.redraw();
  }

  scaleByPercent(percentage) {
    const newWidth = this.original.width * (percentage / 100);
    const newHeight = this.original.width * (percentage / 100);

    const xOffset = (this.original.width - newWidth) / 2;
    const yOffset = (this.original.width - newHeight) / 2;

    this.scale = (percentage / 100);
    this.position.x = xOffset;
    this.position.y = yOffset;
  }

  applyTransparentPixels(context) {
    if (this.alphaPixelColors.size === 0) return;

    let imageData = context.getImageData(0, 0, this.canvas.width, this.canvas.height);
    this.alphaPixelColors.forEach((color) => {
      // iterate over all pixels
      let count = 0;
      for (let i = 0, n = imageData.data.length; i < n; i += 4) {
        const pixelColor = new Color({
          red: imageData.data[i],
          blue: imageData.data[i + 1],
          green: imageData.data[i + 2],
          alpha: imageData.data[i + 3],
        });
        if (color.isNeighborColor(pixelColor)) {
          count++;
          imageData.data[i] = 0;
          imageData.data[i + 1] = 0;
          imageData.data[i + 2] = 0;
          imageData.data[i + 3] = 0;
        }
      }
      libs_logger.debug("Applying the following color transparency", { color, count });
    });
    context.putImageData(imageData, 0, 0);
  }

  addTransparentColour(color) {
    this.alphaPixelColors.add(color);
  }

  applyTransformations(context, alpha = true) {
    context.resetTransform();
    context.clearRect(0, 0, this.source.width, this.source.height);
    context.translate(this.center.x, this.center.y);
    context.scale(this.mirror * 1, 1);
    context.rotate(this.rotation * constants.TO_RADIANS);
    context.translate(-this.center.x, -this.center.y);
    if (alpha) context.globalAlpha = this.alpha;
  }

  recalculateMask() {
    if (this.mask && this.renderedMask && !this.customMask) {
      const context = this.renderedMask.getContext('2d');
      this.applyTransformations(context, false);
      context.drawImage(
        this.mask,
        this.position.x,
        this.position.y,
        this.source.width * this.scale,
        this.source.height * this.scale,
      );
    }
  }

  applyTint(context) {
    const tintCanvas = Utils.cloneCanvas(this.source);
    const tintContext = tintCanvas.getContext("2d");
    tintCanvas.width = this.source.width;
    tintCanvas.height = this.source.height;
    this.applyTransformations(tintContext, false);
    tintContext.drawImage(this.source, 0, 0);
    tintContext.globalCompositeOperation = 'source-atop';
    tintContext.fillStyle = this.tintColor;
    tintContext.alpha = 0.5;
    tintContext.fillRect(0, 0, this.source.width, this.source.height);  
    tintContext.globalCompositeOperation = 'source-over';

    context.globalCompositeOperation = 'color';
    context.drawImage(tintCanvas, 0, 0);
    context.globalCompositeOperation = 'source-over';
  }

  /**
   * Refreshes the view canvas with the background color and/or the source image
   */
  redraw() {
    // we take the original image and apply our scaling transformations
    const original = Utils.cloneCanvas(this.source);
    // apply transformations to original
    const originalContext = original.getContext("2d");
    this.applyTransformations(originalContext, this.source, false);
    originalContext.drawImage(this.source, 0, 0);
    if (this.tintLayer) this.applyTint(originalContext);
    originalContext.resetTransform();

    // place the computed layer on the view canvas

    const preview = this.preview.getContext("2d");
    const context = this.canvas.getContext("2d");
    [context, preview].forEach((cContext) => {
      cContext.globalCompositeOperation = this.compositeOperation;
      cContext.clearRect(0, 0, this.source.width, this.source.height);
      cContext.resetTransform();
    });

    const maskIds = this.customMaskLayers ? this.appliedMaskIds : this.view.maskIds;
    for (const maskId of maskIds) {
      const maskLayer = this.view.getMaskLayer(maskId);
      // we apply the mask if the layer is below a masking layer if not using custom masking layers
      if (maskLayer
        && (this.customMaskLayers || (!this.customMaskLayers && this.view.isOriginLayerHigher(maskId, this.id)))
      ) {
        context.drawImage(
          maskLayer.renderedMask,
          0,
          0,
          maskLayer.width,
          maskLayer.height,
          0,
          0,
          this.canvas.width,
          this.canvas.height,
        );
        context.globalCompositeOperation = this.maskCompositeOperation;
      }
    }

    [context, preview].forEach((cContext) => {
      cContext.translate(0, 0);

      if (this.colorLayer) {
        cContext.fillStyle = this.color;
        cContext.rect(0, 0, this.width, this.height);
        cContext.fill();
      } else {
        // apply computed image and scale
        cContext.drawImage(
          original,
          this.position.x,
          this.position.y,
          this.source.width * this.scale,
          this.source.height * this.scale,
        );
        this.applyTransparentPixels(cContext);
      }

      cContext.resetTransform();
    });
  }
}

;// CONCATENATED MODULE: ./src/tokenizer/Control.js


class Control {

  toggleVisibleDiv(button, element) {
    // this.tokenizer.activeLayerSelectorElement currently selected selector
    // this.tokenizer.lastControlButtonClicked the last clicked selector button

    // cases
    // selector button clicked, show selector
    // selector button clicked, dismiss selector
    // - clicked back on button after selector dismissed by button click
    // clicked inside selector, nothing
    // clicked outside selector, dismiss selector
    // - clicked back on button after selector dismissed by outside click
    // click on another button, dismiss selector, show new selector

    element.classList.toggle("show");
    this.tokenizer.lastControlButtonClicked = button;
    this.tokenizer.activeLayerSelectorElement = element.classList.contains("show")
      ? element
      : null;
  }

  constructor(tokenizer, layer) {
    this.tokenizer = tokenizer;
    this.layer = layer;
    this.view = document.createElement('div');
    this.view.setAttribute('data-layer', this.layer.id);
    this.view.classList.add('view-layer-control');

    const idSection = document.createElement("div");
    idSection.name = "layer-id-num";
    idSection.title = game.i18n.localize("vtta-tokenizer.label.LayerNumber");
    idSection.classList.add("section");
    this.idNumber = document.createElement("div");
    this.idNumber.innerHTML = this.layer.getLayerLabel();

    let previewSection = document.createElement('div');
    previewSection.name = 'preview';
    previewSection.classList.add('section');

    let previewMaskSection = document.createElement('div');
    previewMaskSection.name = 'previewMask';
    previewMaskSection.classList.add('section');

    this.configureColorManagement();

    this.configureMaskManagementSection();

    this.configureTranslationControls();

    // opacity management
    this.configureOpacitySection();
    this.configureMagicLassoSection();

    // the move up/down order section
    this.configureMovementSection();

    // danger zone
    this.configureDeletionSection();

    // push all elements to the control's view
    this.view.appendChild(idSection);
    idSection.appendChild(this.idNumber);
    this.view.appendChild(previewSection);
    previewSection.appendChild(this.layer.preview);
    this.view.appendChild(previewMaskSection);
    previewMaskSection.appendChild(this.layer.renderedMask);
    this.view.appendChild(this.maskManagementSection);
    if (this.layer.colorLayer) {
      this.view.appendChild(this.colorManagementSection);
      this.colorManagementSection.appendChild(this.visibleControl);
      this.colorManagementSection.appendChild(this.colorSelector);
      this.colorManagementSection.appendChild(this.colorSelectorProxy);
      this.colorManagementSection.appendChild(this.clearColor);
      this.colorManagementSection.appendChild(this.getColor);
      this.colorManagementSection.appendChild(this.opacityManagementSection);
      this.maskControl.disabled = true;
    } else {
      this.view.appendChild(this.positionManagementSection);
      this.positionManagementSection.appendChild(this.visibleControl);
      this.positionManagementSection.appendChild(this.activeControl);
      // this.positionManagementSection.appendChild(this.flipControl);
      // this.positionManagementSection.appendChild(this.centreLayerControl);
      this.positionManagementSection.appendChild(this.colorSelectionManagementSection);
      this.positionManagementSection.appendChild(this.opacityManagementSection);
      // this.positionManagementSection.appendChild(this.resetControl);
      this.positionManagementSection.appendChild(this.layerMovementControl);
      // this.positionManagementSection.appendChild(this.layerMovementSelectorSpan);
    }
    this.view.appendChild(this.moveManagementSection);
    this.view.appendChild(this.deleteSection);
  }

  configureMaskManagementSection() {
    this.maskManagementSection = document.createElement('div');
    this.maskManagementSection.name = 'mask-management';
    this.maskManagementSection.classList.add('section');
    let maskManagementTitle = document.createElement('span');
    maskManagementTitle.innerHTML = 'Masks';
    this.maskManagementSection.appendChild(maskManagementTitle);

    // Set the basic mask of this layer
    this.maskControl = document.createElement('button');
    this.maskControl.classList.add('mask-control', 'popup-button');
    this.maskControl.title = game.i18n.localize("vtta-tokenizer.label.ToggleBasicMask");
    let maskButtonText = document.createElement('i');
    maskButtonText.classList.add('fas', 'fa-mask');
    this.maskControl.appendChild(maskButtonText);

    // send a mask event when clicked
    this.maskControl.addEventListener("click", (event) => {
      event.preventDefault();
      this.view.dispatchEvent(new CustomEvent('mask', { detail: { layerId: this.layer.id } }));
    });

    // Set the mask of this layer
    this.maskEditControl = document.createElement('button');
    this.maskEditControl.classList.add('mask-control', 'popup-button');
    // this.maskEditControl.disabled = true;
    this.maskEditControl.title = game.i18n.localize("vtta-tokenizer.label.EditMask");
    let maskEditButtonText = document.createElement('i');
    maskEditButtonText.classList.add('fas', 'fa-pencil');
    this.maskEditControl.appendChild(maskEditButtonText);

    // send a mask event when clicked
    this.maskEditControl.addEventListener("click", (event) => {
      event.preventDefault();
      this.view.dispatchEvent(new CustomEvent('edit-mask', { detail: { layerId: this.layer.id } }));
    });

    // Set the mask of this layer
    this.maskResetControl = document.createElement('button');
    this.maskResetControl.classList.add('popup-button');
    this.maskResetControl.title = game.i18n.localize("vtta-tokenizer.label.ResetMasks");
    let maskResetButtonText = document.createElement('i');
    maskResetButtonText.classList.add('fas', 'fa-compress-arrows-alt');
    this.maskResetControl.appendChild(maskResetButtonText);

    this.maskResetControl.addEventListener("click", (event) => {
      event.preventDefault();
      this.view.dispatchEvent(new CustomEvent('reset-mask-layer', { detail: { layerId: this.layer.id } }));
    });

    this.masksControl = document.createElement('button');
    this.masksControl.classList.add('blend-control');
    this.masksControl.title = game.i18n.localize("vtta-tokenizer.label.AdvancedMaskApplication");

    let masksButtonText = document.createElement('i');
    masksButtonText.classList.add('fas', 'fa-masks-theater');
    this.masksControl.appendChild(masksButtonText);

    this.maskSelectorSpan = document.createElement('div');
    this.maskSelectorSpan.classList.add('popup');

    this.maskLayerSelector = document.createElement("div");
    this.maskLayerSelector.classList.add("popup-selector");

    this.addSelectLayerMasks();
    let basicMaskControls = document.createElement('div');
    basicMaskControls.classList.add('basic-mask-control');
    basicMaskControls.appendChild(this.maskControl);
    basicMaskControls.appendChild(this.maskEditControl);
    basicMaskControls.appendChild(this.maskResetControl);
    
    this.maskSelectorSpan.appendChild(basicMaskControls);
    this.maskSelectorSpan.appendChild(this.maskLayerSelector);

    this.blendControlImage = document.createElement('select');
    this.blendControlImage.classList.add('blend-control-image');
    this.blendControlMask = document.createElement('select');
    this.blendControlMask.classList.add('blend-control-mask');

    [this.blendControlMask, this.blendControlImage].forEach((blendControlElement) => {
      blendControlElement.classList.add('blend-control-selector');
      for (const mode of Object.values(constants.BLEND_MODES)) {
        const option = document.createElement('option');
        option.value = mode;
        option.innerHTML = mode;
        if ((blendControlElement.classList.contains("blend-control-image") && mode === this.layer.compositeOperation)
          || (blendControlElement.classList.contains("blend-control-mask") && mode === this.layer.maskCompositeOperation)) {
          option.selected = true;
        }
        blendControlElement.append(option);
      }
  
      blendControlElement.addEventListener('change', (event) => {
        event.preventDefault();
        this.view.dispatchEvent(new CustomEvent('blend', {
          detail: {
            layerId: this.layer.id,
            image: blendControlElement.classList.contains("blend-control-image"),
            mask: blendControlElement.classList.contains("blend-control-mask"),
            blendMode: event.target.value,
          },
        }));
      });
  
    });

    let blendImageDiv = document.createElement('div');
    let blendImageText = document.createElement('i');
    blendImageText.title = game.i18n.localize("vtta-tokenizer.label.ImageBlendMode");
    blendImageText.classList.add('fas', 'fa-image');
    blendImageDiv.appendChild(blendImageText);
    blendImageDiv.appendChild(this.blendControlImage);
    this.maskSelectorSpan.appendChild(blendImageDiv);

    let blendMaskDiv = document.createElement('div');
    let blendMaskText = document.createElement('i');
    blendMaskText.title = game.i18n.localize("vtta-tokenizer.label.MaskBlendMode");
    blendMaskText.classList.add('fas', 'fa-mask');
    blendMaskDiv.appendChild(blendMaskText);
    blendMaskDiv.appendChild(this.blendControlMask);
    this.maskSelectorSpan.appendChild(blendMaskDiv);

    // send an activate event when clicked
    this.masksControl.addEventListener("click", (event) => {
      event.preventDefault();
      this.toggleVisibleDiv(this.masksControl, this.maskSelectorSpan);
    }, true);

    // blend mode controls
    let blendManagementSection = document.createElement('div');
    blendManagementSection.appendChild(this.masksControl);
    blendManagementSection.appendChild(this.maskSelectorSpan);
    this.maskManagementSection.appendChild(blendManagementSection);
  }

  configureTranslationControls() {
    // position management section
    this.positionManagementSection = document.createElement('div');
    this.positionManagementSection.name = 'position-management';
    this.positionManagementSection.classList.add('section');
    let positionManagementTitle = document.createElement('span');
    positionManagementTitle.innerHTML = game.i18n.localize("vtta-tokenizer.label.Transform");
    this.positionManagementSection.appendChild(positionManagementTitle);

    // is this layer visible?
    this.visibleControl = document.createElement('button');
    this.visibleControl.classList.add('visible-layer');
    this.visibleControl.title = game.i18n.localize("vtta-tokenizer.label.VisibleLayer");

    let visibleButtonText = document.createElement('i');
    visibleButtonText.classList.add('fas', 'fa-eye');
    this.visibleControl.appendChild(visibleButtonText);

    // send a mask event when clicked
    this.visibleControl.addEventListener("click", (event) => {
      event.preventDefault();
      this.view.dispatchEvent(new CustomEvent('visible', { detail: { layerId: this.layer.id } }));
    });

    // Makes the layer active for translating/ scaling
    this.activeControl = document.createElement('button');
    this.activeControl.title = game.i18n.localize("vtta-tokenizer.label.EnableDisableTransformation");
    this.activeControl.classList.add('mask-control');
    let activeButtonText = document.createElement('i');
    activeButtonText.classList.add('fas', 'fa-lock');
    this.activeControl.appendChild(activeButtonText);

    // send an activate event when clicked
    this.activeControl.addEventListener("click", (event) => {
      event.preventDefault();
      if (this.activeControl.classList.contains('active')) {
        this.view.dispatchEvent(new CustomEvent('deactivate', { detail: { layerId: this.layer.id } }));
      } else {
        this.view.dispatchEvent(new CustomEvent('activate', { detail: { layerId: this.layer.id } }));
      }
    });

    // Makes flips the layer
    this.flipControl = document.createElement('button');
    this.flipControl.title = game.i18n.localize("vtta-tokenizer.label.FlipLayer");
    this.flipControl.classList.add('flip-control', 'popup-button');
    let flipButtonText = document.createElement('i');
    flipButtonText.classList.add('fas', 'fa-people-arrows');
    this.flipControl.appendChild(flipButtonText);

    // send an activate event when clicked
    this.flipControl.addEventListener("click", (event) => {
      event.preventDefault();
      this.view.dispatchEvent(new CustomEvent('flip', { detail: { layerId: this.layer.id } }));
    });

    // resets the layer on the view
    this.resetControl = document.createElement('button');
    this.resetControl.classList.add('reset-control', 'popup-button');
    this.resetControl.title = game.i18n.localize("vtta-tokenizer.label.ResetLayer");
    let resetButtonText = document.createElement('i');
    resetButtonText.classList.add('fas', 'fa-compress-arrows-alt');
    this.resetControl.appendChild(resetButtonText);

    // send an activate event when clicked
    this.resetControl.addEventListener("click", (event) => {
      event.preventDefault();
      this.view.dispatchEvent(new CustomEvent('reset', { detail: { layerId: this.layer.id } }));
    });

    // Centres the layer
    this.centreLayerControl = document.createElement('button');
    this.centreLayerControl.title = game.i18n.localize("vtta-tokenizer.label.CentreLayer");
    this.centreLayerControl.classList.add('centre-control', 'popup-button');
    let centreLayerText = document.createElement('i');
    centreLayerText.classList.add('fas', 'fa-crosshairs');
    this.centreLayerControl.appendChild(centreLayerText);

    // send an activate event when clicked
    this.centreLayerControl.addEventListener("click", (event) => {
      event.preventDefault();
      this.view.dispatchEvent(new CustomEvent('centre-layer', { detail: { layerId: this.layer.id } }));
    });

    // Layer movement selector
    let layerMovementSelectorDiv = document.createElement('div');
    layerMovementSelectorDiv.classList.add('popup');

    // Layer movement controls
    let layerMovementControl = document.createElement('button');
    layerMovementControl.title = game.i18n.localize("vtta-tokenizer.label.LayerMovementControls");
    layerMovementControl.classList.add('layer-movement-control');
    let layerMovementText = document.createElement('i');
    layerMovementText.classList.add('fas', 'fa-toolbox');
    layerMovementControl.appendChild(layerMovementText);

    layerMovementControl.addEventListener("click", (event) => {
      event.preventDefault();
      this.toggleVisibleDiv(this.layerMovementControl, layerMovementSelectorDiv);
    }, true);

    let buttonDiv = document.createElement("div");
    buttonDiv.classList.add("popup-selector");

    buttonDiv.appendChild(this.flipControl);
    buttonDiv.appendChild(this.centreLayerControl);
    buttonDiv.appendChild(this.resetControl);

    layerMovementSelectorDiv.appendChild(buttonDiv);
    layerMovementSelectorDiv.appendChild(document.createElement('hr'));

    let scaleDiv = document.createElement('div');
    scaleDiv.classList.add("popup-selector");

    this.scaleInput = document.createElement('input');
    this.scaleInput.type = "text";
    this.scaleInput.value = `${this.layer.scale * 100}`;
    this.scaleInput.classList.add('scale-input', 'popup-input');

    this.scaleControl = document.createElement('button');
    this.scaleControl.title = game.i18n.localize("vtta-tokenizer.label.ScaleButton");
    this.scaleControl.classList.add('scale-control', 'popup-button');
    let scaleText = document.createElement('i');
    scaleText.classList.add('fas', 'fa-compress');
    this.scaleControl.appendChild(scaleText);

    this.scaleControl.addEventListener("click", (event) => {
      event.preventDefault();
      const percentage = parseFloat(this.scaleInput.value);
      if (isNaN(percentage)) {
        this.scaleInput.value = `${this.layer.scale * 100}`;
      } else {
        this.view.dispatchEvent(new CustomEvent('scale-layer', { detail: { layerId: this.layer.id, percent: percentage } }));
      }
    });

    scaleDiv.appendChild(this.scaleInput);
    scaleDiv.appendChild(this.scaleControl);

    layerMovementSelectorDiv.appendChild(scaleDiv);

    let wrapperDiv = document.createElement("div");
    wrapperDiv.appendChild(layerMovementControl);
    wrapperDiv.appendChild(layerMovementSelectorDiv);
    
    this.layerMovementControl = wrapperDiv;
  }

  configureDeletionSection() {
    this.deleteSection = document.createElement('div');
    this.deleteSection.name = 'delete-management';
    this.deleteSection.classList.add('section');

    // duplicate
    this.duplicateControl = document.createElement('button');
    this.duplicateControl.classList.add('duplicate-control');
    this.duplicateControl.title = game.i18n.localize("vtta-tokenizer.label.CloneLayer");
    let duplicateButtonText = document.createElement('i');
    duplicateButtonText.classList.add('fas', 'fa-clone');
    this.duplicateControl.appendChild(duplicateButtonText);

    this.duplicateControl.addEventListener("click", (event) => {
      event.preventDefault();
      this.view.dispatchEvent(
        new CustomEvent('duplicate', {
          detail: { layerId: this.layer.id },
        }),
      );
    });

    // delete
    this.deleteControl = document.createElement('button');
    this.deleteControl.classList.add('delete-control');
    this.deleteControl.title = game.i18n.localize("vtta-tokenizer.label.DeleteLayer");
    let deleteButtonText = document.createElement('i');
    deleteButtonText.classList.add('fas', 'fa-trash-alt');
    this.deleteControl.appendChild(deleteButtonText);

    this.deleteControl.addEventListener("click", (event) => {
      event.preventDefault();
      this.view.dispatchEvent(
        new CustomEvent('delete', {
          detail: { layerId: this.layer.id },
        }),
      );
    });

    this.deleteSection.appendChild(this.duplicateControl);
    this.deleteSection.appendChild(this.deleteControl);
  }

  configureColorManagement() {
    this.colorManagementSection = document.createElement('div');
    this.colorManagementSection.name = 'color-management';
    this.colorManagementSection.classList.add('section');
    let colorManagementTitle = document.createElement('span');
    colorManagementTitle.innerHTML = game.i18n.localize("vtta-tokenizer.label.Color");
    this.colorManagementSection.appendChild(colorManagementTitle);

    // the color picker element, which is hidden
    this.colorSelector = document.createElement('input');
    this.colorSelector.type = 'color';
    this.colorSelector.value = '#00000FF';

    // a nicer looking proxy for the color picker
    this.colorSelectorProxy = document.createElement('div');
    this.colorSelectorProxy.title = game.i18n.localize("vtta-tokenizer.label.EditTint");
    this.colorSelectorProxy.classList.add('color-picker', 'transparent');
    this.colorSelectorProxy.addEventListener("click", () => {
      this.colorSelector.click();
    });

    // listen to the color Selector onChange Event to update the layer's background color
    this.colorSelector.addEventListener('change', (event) => {
      this.colorSelectorProxy.style.backgroundColor = event.target.value;
      this.colorSelectorProxy.classList.remove('transparent');
      this.view.dispatchEvent(
        new CustomEvent('color', {
          detail: { layerId: this.layer.id, color: event.target.value },
        }),
      );
    });

    // ability to clear the color of the layer
    this.clearColor = document.createElement('button');
    this.clearColor.disabled = true;
    this.clearColor.classList.add('danger');
    this.clearColor.title = game.i18n.localize("vtta-tokenizer.label.ClearTint");
    let clearButtonText = document.createElement('i');
    clearButtonText.classList.add('fas', 'fa-minus-circle');
    this.clearColor.appendChild(clearButtonText);

    this.clearColor.addEventListener("click", (event) => {
      event.preventDefault();
      this.view.dispatchEvent(
        new CustomEvent('color', {
          detail: { layerId: this.layer.id, color: null },
        }),
      );
    });

    // get color from canvas
    this.getColor = document.createElement('button');
    this.getColor.title = game.i18n.localize("vtta-tokenizer.label.PickTint");
    let colorButtonText = document.createElement('i');
    colorButtonText.classList.add('fas', 'fa-eye-dropper');
    this.getColor.appendChild(colorButtonText);

    // dispatch the request for color picking
    this.getColor.addEventListener("click", (event) => {
      event.preventDefault();
      if (this.getColor.classList.contains('active')) {
        this.getColor.classList.remove('active');
        this.view.dispatchEvent(
          new CustomEvent('pick-color-end', {
            detail: { layerId: this.layer.id },
          }),
        );
      } else {
        this.getColor.classList.add('active');
        this.view.dispatchEvent(
          new CustomEvent('pick-color-start', {
            detail: { layerId: this.layer.id },
          }),
        );
      }
    });
  }

  configureMovementSection() {
    this.moveManagementSection = document.createElement('div');
    this.moveManagementSection.classList.add('move-control');
    this.moveManagementSection.name = 'move-management';
    this.moveManagementSection.classList.add('section');

    // moving up
    this.moveUpControl = document.createElement('button');
    this.moveUpControl.classList.add('move-control', 'move-up');
    this.moveUpControl.title = game.i18n.localize("vtta-tokenizer.label.MoveLayerUp");
    let moveUpButtonText = document.createElement('i');
    moveUpButtonText.classList.add('fas', 'fa-caret-up');
    this.moveUpControl.appendChild(moveUpButtonText);

    // moving up event dispatcher
    this.moveUpControl.addEventListener("click", (event) => {
      event.preventDefault();
      this.view.dispatchEvent(
        new CustomEvent('move', {
          detail: { layerId: this.layer.id, direction: 'up' },
        }),
      );
    });

    // moving down
    this.moveDownControl = document.createElement('button');
    this.moveDownControl.classList.add('move-control', 'move-down');
    this.moveDownControl.title = game.i18n.localize("vtta-tokenizer.label.MoveLayerDown");
    let moveDownButtonText = document.createElement('i');
    moveDownButtonText.classList.add('fas', 'fa-caret-down');
    this.moveDownControl.appendChild(moveDownButtonText);

    // moving down event dispatcher
    this.moveDownControl.addEventListener("click", (event) => {
      event.preventDefault();
      this.view.dispatchEvent(
        new CustomEvent('move', {
          detail: { layerId: this.layer.id, direction: 'down' },
        }),
      );
    });
    this.moveManagementSection.appendChild(this.moveUpControl);
    this.moveManagementSection.appendChild(this.moveDownControl);

  }

  configureOpacitySection() {
    this.opacityManagementSection = document.createElement('div');

    this.opacityControl = document.createElement('button');
    this.opacityControl.classList.add('opacity-control');
    this.opacityControl.title = game.i18n.localize("vtta-tokenizer.label.Opacity");

    let opacityButtonText = document.createElement('i');
    opacityButtonText.classList.add('fas', 'fa-adjust');
    this.opacityControl.appendChild(opacityButtonText);
    this.opacityManagementSection.appendChild(this.opacityControl);

    // this.opacitySliderSpan = document.createElement('span');
    this.opacitySliderSpan = document.createElement('div');
    this.opacitySliderSpan.classList.add('popup');
    // this.opacitySliderSpan.classList.add("property-attribution");

    this.opacitySliderControl = document.createElement('input');
    this.opacitySliderControl.type = 'range';
    this.opacitySliderControl.min = 0;
    this.opacitySliderControl.max = 100;
    this.opacitySliderControl.value = 100;
    this.opacitySliderControl.title = game.i18n.localize("vtta-tokenizer.label.Opacity");
    this.opacitySliderControl.name = "opacity";

    this.opacitySliderSpan.appendChild(this.opacitySliderControl);

    // send an activate event when clicked
    this.opacityControl.addEventListener("click", (event) => {
      event.preventDefault();
      this.toggleVisibleDiv(this.opacityControl, this.opacitySliderSpan);
    }, true);

    this.opacitySliderSpan.addEventListener('mouseleave', () => {
      this.opacitySliderSpan.classList.remove("show");
    });

    this.opacitySliderControl.addEventListener('input', (event) => {
      event.preventDefault();
      const detail = {
        layerId: this.layer.id,
        opacity: event.target.value,
      };
      this.view.dispatchEvent(new CustomEvent('opacity', { detail }));
    });

    this.opacityManagementSection.appendChild(this.opacitySliderSpan);
  }

  configureMagicLassoSection() {
    this.colorSelectionManagementSection = document.createElement('div');

    this.colorSelectionControl = document.createElement('button');
    this.colorSelectionControl.classList.add('color-selection-control');
    this.colorSelectionControl.title = game.i18n.localize("vtta-tokenizer.label.ColorChangeControl");

    let buttonText = document.createElement('i');
    buttonText.classList.add('fa-thin', 'fa-eye-dropper', 'fa-regular');
    this.colorSelectionControl.appendChild(buttonText);
    this.colorSelectionManagementSection.appendChild(this.colorSelectionControl);

    this.colorThresholdSliderSpan = document.createElement('div');
    this.colorThresholdSliderSpan.classList.add('popup');

    this.colorThresholdSliderControl = document.createElement('input');
    this.colorThresholdSliderControl.type = 'range';
    this.colorThresholdSliderControl.min = 0;
    this.colorThresholdSliderControl.max = 150;
    this.colorThresholdSliderControl.value = 15;
    this.colorThresholdSliderControl.title = game.i18n.localize("vtta-tokenizer.label.ColorThreshold");
    this.colorThresholdSliderControl.name = "color-threshold";

    // send an activate event when clicked
    this.colorSelectionControl.addEventListener("click", (event) => {
      event.preventDefault();
      this.toggleVisibleDiv(this.colorSelectionControl, this.colorThresholdSliderSpan);
    }, true);

    this.colorThresholdSliderControl.addEventListener('input', (event) => {
      event.preventDefault();
      const detail = {
        layerId: this.layer.id,
        tolerance: event.target.value,
      };
      this.view.dispatchEvent(new CustomEvent('transparency-level', { detail }));
    });

    // get color from canvas
    this.getAlpha = document.createElement('button');
    this.getAlpha.classList.add('popup-button');
    this.getAlpha.title = game.i18n.localize("vtta-tokenizer.label.PickAlpha");
    let alphaButtonText = document.createElement('i');
    alphaButtonText.classList.add('fa-thin', 'fa-eye-dropper', 'fa-regular');
    this.getAlpha.appendChild(alphaButtonText);

    // dispatch the request for color picking
    this.getAlpha.addEventListener("click", (event) => {
      event.preventDefault();
      if (this.getAlpha.classList.contains('active')) {
        this.getAlpha.classList.remove('active');
        this.view.dispatchEvent(
          new CustomEvent('pick-alpha-end', {
            detail: { layerId: this.layer.id },
          }),
        );
      } else {
        this.getAlpha.classList.add('active');
        this.view.dispatchEvent(
          new CustomEvent('pick-alpha-start', {
            detail: { layerId: this.layer.id },
          }),
        );
      }
    });

    this.alphaSelectorProxy = document.createElement('div');
    this.alphaSelectorProxy.classList.add('color-picker', 'transparent');

    this.transparencyResetControl = document.createElement('button');
    this.transparencyResetControl.classList.add('popup-button');
    this.transparencyResetControl.title = game.i18n.localize("vtta-tokenizer.label.ResetColorTransparency");
    let resetButtonText = document.createElement('i');
    resetButtonText.classList.add('fas', 'fa-compress-arrows-alt');
    this.transparencyResetControl.appendChild(resetButtonText);

    this.transparencyResetControl.addEventListener("click", (event) => {
      event.preventDefault();
      this.view.dispatchEvent(new CustomEvent('reset-transparency-level', { detail: { layerId: this.layer.id } }));
    });

    // get color from canvas
    this.magicLassoControl = document.createElement('button');
    this.magicLassoControl.classList.add('popup-button');
    this.magicLassoControl.title = game.i18n.localize("vtta-tokenizer.label.MagicLasso");
    let magicLassoButtonText = document.createElement('i');
    magicLassoButtonText.classList.add('fa-thin', 'fa-lasso-sparkles', 'fa-regular');
    this.magicLassoControl.appendChild(magicLassoButtonText);

    this.magicLassoControl.addEventListener("click", (event) => {
      event.preventDefault();
      this.view.dispatchEvent(new CustomEvent('magic-lasso', { detail: { layerId: this.layer.id } }));
    });


    let lassoControls = document.createElement('div');
    lassoControls.classList.add('basic-mask-control');
    lassoControls.appendChild(this.magicLassoControl);

    this.#tintControls();
    let tintControls = document.createElement('div');
    tintControls.classList.add('basic-mask-control');
    tintControls.appendChild(this.colorTintSelector);
    tintControls.appendChild(this.colorTintSelectorProxy);
    tintControls.appendChild(this.clearColorTint);

    let transparencyControls = document.createElement('div');
    transparencyControls.classList.add('basic-mask-control');
    transparencyControls.appendChild(this.alphaSelectorProxy);
    transparencyControls.appendChild(this.getAlpha);
    transparencyControls.appendChild(this.transparencyResetControl);

    this.colorThresholdSliderSpan.appendChild(lassoControls);
    this.colorThresholdSliderSpan.appendChild(document.createElement('hr'));
    this.colorThresholdSliderSpan.appendChild(tintControls);
    this.colorThresholdSliderSpan.appendChild(document.createElement('hr'));
    this.colorThresholdSliderSpan.appendChild(transparencyControls);
    this.colorThresholdSliderSpan.appendChild(this.colorThresholdSliderControl);
    this.colorSelectionManagementSection.appendChild(this.colorThresholdSliderSpan);
  }

  #tintControls() {
    // the color picker element, which is hidden
    this.colorTintSelector = document.createElement('input');
    this.colorTintSelector.type = 'color';
    this.colorTintSelector.value = '#00000FF';

    // a nicer looking proxy for the color picker
    this.colorTintSelectorProxy = document.createElement('div');
    this.colorTintSelectorProxy.title = game.i18n.localize("vtta-tokenizer.label.EditLayerTint");
    this.colorTintSelectorProxy.classList.add('color-picker', 'transparent');
    this.colorTintSelectorProxy.addEventListener("click", () => {
      this.colorTintSelector.click();
    });

    // listen to the color Selector onChange Event to update the layer's background color
    this.colorTintSelector.addEventListener('change', (event) => {
      this.colorTintSelectorProxy.style.backgroundColor = event.target.value;
      this.colorTintSelectorProxy.classList.remove('transparent');
      this.view.dispatchEvent(
        new CustomEvent('color-tint', {
          detail: { layerId: this.layer.id, color: event.target.value },
        }),
      );
    });

    // ability to clear the color of the layer
    this.clearColorTint = document.createElement('button');
    this.clearColorTint.disabled = true;
    this.clearColorTint.classList.add('danger', 'popup-button');
    this.clearColorTint.title = game.i18n.localize("vtta-tokenizer.label.ClearTint");
    let clearButtonText = document.createElement('i');
    clearButtonText.classList.add('fas', 'fa-minus-circle');
    this.clearColorTint.appendChild(clearButtonText);

    this.clearColorTint.addEventListener("click", (event) => {
      event.preventDefault();
      this.view.dispatchEvent(
        new CustomEvent('color-tint', {
          detail: { layerId: this.layer.id, color: null },
        }),
      );
    });
  }

  addSelectLayerMasks() {
    this.maskLayerSelector.innerHTML = "";
    this.layer.view.layers.forEach((layer) => {
      const layerIdDiv = document.createElement("div");
      const active = this.layer.appliedMaskIds.has(layer.id);
      const layerNum = this.layer.view.layers.findIndex((l) => l.id === layer.id);

      const button = document.createElement('button');
      button.classList.add('popup-choice');
      if (active) button.classList.add('active');
      button.title = game.i18n.format("vtta-tokenizer.label.ToggleLayer", { layerNum });
      button.innerHTML = layer.getLayerLabel(active);

      button.addEventListener("click", (event) => {
        event.preventDefault();
        this.view.dispatchEvent(
          new CustomEvent('mask-layer', {
            detail: { layerId: this.layer.id, maskLayerId: layer.id },
          }),
        );
      });

      layerIdDiv.appendChild(button);
      this.maskLayerSelector.appendChild(layerIdDiv);
    });
  }

  refresh() {
    this.idNumber.innerHTML = this.layer.getLayerLabel();
    // is this layer providing the mask for the view?
    if (this.layer.customMaskLayers) {
      this.maskControl.classList.remove('active');
      this.maskControl.disabled = true;
    } else if (this.layer.providesMask) {
      this.maskControl.classList.add('active');
      // this.maskEditControl.disabled = false;
    } else {
      this.maskControl.classList.remove('active');
      // this.maskEditControl.disabled = true;
    }

    this.maskLayerSelector.innerHTML = "";
    this.addSelectLayerMasks();

    // is this layer visible
    if (this.layer.visible) {
      this.visibleControl.classList.add('active');
      this.visibleControl.firstChild.classList.remove('fa-eye-slash');
      this.visibleControl.firstChild.classList.add('fa-eye');
    } else {
      this.visibleControl.classList.remove('active');
      this.visibleControl.firstChild.classList.remove('fa-eye');
      this.visibleControl.firstChild.classList.add('fa-eye-slash');
    }

    // is this layer active?
    if (this.layer.active) {
      this.activeControl.classList.add('active');
      this.activeControl.firstChild.classList.remove('fa-lock');
      this.activeControl.firstChild.classList.add('fa-lock-open');
    } else {
      this.activeControl.classList.remove('active');
      this.activeControl.firstChild.classList.remove('fa-lock-open');
      this.activeControl.firstChild.classList.add('fa-lock');
    }

    // is this layer's color currently transparent / null
    if (this.layer.color === null) {
      this.colorSelectorProxy.classList.add('transparent');
      this.clearColor.disabled = true;
    } else {
      this.colorSelectorProxy.classList.remove('transparent');
      this.colorSelectorProxy.style.backgroundColor = this.layer.color;
      this.clearColor.disabled = false;
    }

    if (this.layer.tintColor === null) {
      this.colorTintSelectorProxy.classList.add('transparent');
      this.clearColorTint.disabled = true;
    } else {
      this.colorTintSelectorProxy.classList.remove('transparent');
      this.colorTintSelectorProxy.style.backgroundColor = this.layer.tintColor;
      this.clearColorTint.disabled = false;
    }

    if (this.layer.view.isAlphaPicking) {
      this.alphaSelectorProxy.classList.remove('transparent');
      this.alphaSelectorProxy.style.backgroundColor = this.layer.view.alphaColorHex;
    } else {
      this.alphaSelectorProxy.classList.add('transparent');
    }

    // first child?
    this.enableMoveUp();
    this.enableMoveDown();
    if (this.view.parentElement.firstChild.getAttribute('data-layer') === this.layer.id) {
      this.disableMoveUp();
    }
    // last child?
    if (this.view.parentElement.lastChild.getAttribute('data-layer') === this.layer.id) {
      this.disableMoveDown();
    }

    // only child?
    if (this.view.parentElement.childElementCount === 1) {
      this.deleteControl.disabled = true;
    } else {
      this.deleteControl.disabled = false;
    }
  }

  startColorPicking() {
    this.getColor.classList.add('active');
  }

  endColorPicking() {
    this.getColor.classList.remove('active');
  }

  startAlphaPicking() {
    this.getAlpha.classList.add('active');
  }

  endAlphaPicking() {
    this.getAlpha.classList.remove('active');
    this.colorThresholdSliderSpan.classList.toggle("show");
  }

  enableMoveUp() {
    this.moveUpControl.disabled = false;
  }

  disableMoveUp() {
    this.moveUpControl.disabled = true;
  }

  enableMoveDown() {
    this.moveDownControl.disabled = false;
  }

  disableMoveDown() {
    this.moveDownControl.disabled = true;
  }
}

;// CONCATENATED MODULE: ./src/tokenizer/View.js







class View {
  constructor(tokenizer, dimension, element) {
    this.tokenizer = tokenizer;
    // the canvas where the resulting image is rendered to
    this.canvas = document.createElement('canvas');
    this.canvas.width = dimension;
    this.canvas.height = dimension;
    this.canvas.style.width = dimension;
    this.canvas.style.height = dimension;

    // keep track of all layers
    this.layers = [];

    // keep track of all controls;
    this.controls = [];

    this.menu = null;

    // there is one mask that is active for every layer
    this.maskIds = new Set();

    // the currently selected layer for translation/scaling
    this.activeLayer = null;

    // the user wants to retrieve a color from the view's layers
    this.isColorPicking = false;
    this.colorPickingForLayer = null;
    this.colorPickingLayerId = null;

    // alpha picking
    this.isAlphaPicking = false;
    this.alphaPickingForLayer = null;
    this.alphaPickingLayerId = null;
    this.alphaColor = null;
    this.alphaTolerance = 50;

    // The working stage for the View
    this.stage = document.createElement('div');
    this.stage.name = 'view';

    if (element.id === "tokenizer-token") {
      this.stage.setAttribute("id", "token-canvas");
      this.type = "token";
    } else if (element.id === "tokenizer-avatar") {
      this.stage.setAttribute("id", "avatar-canvas");
      this.type = "avatar";
    }

    // The controls area for the View
    this.controlsArea = document.createElement('div');
    this.controlsArea.name = 'view-controls';

    // The menu bar for the View
    this.menu = document.createElement('div');
    this.menu.name = 'view-menu';

    // add them both to the designated View element as child nodes
    element.appendChild(this.stage);
    this.stage.appendChild(this.canvas);
    element.appendChild(this.controlsArea);
    element.appendChild(this.menu);

    const moveFunction = Utils.throttle(this.onMouseMove.bind(this), 15);
    // add event listeners for translation/scaling of the active layer
    this.canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
    this.canvas.addEventListener('mouseup', this.onMouseUp.bind(this));
    this.canvas.addEventListener('mousemove', moveFunction);
    // this.canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
    this.canvas.addEventListener('wheel', this.onWheel.bind(this), {
      passive: false,
    });
  }

  /**
   * Returns the current canvas in one of three types
   * @param {canvas | blob | Image} type Defines the return type: canvas, blob or Image
   */
  get(type = 'canvas') {
    switch (type.toLowerCase()) {
      case 'img':
        return new Promise((resolve, reject) => {
          let img = document.createElement('img');
          img.onload = () => {
            resolve(img);
          };
          img.onerror = (error) => {
            reject(error);
          };
          img.src = this.canvas.toDataURL();
        });
      case 'blob': {
        const imageFormat = game.settings.get(constants.MODULE_ID, "image-save-type");
        return new Promise((resolve, reject) => {
          try {
            const clone = Utils.cloneCanvas(this.canvas);
            const context = clone.getContext('2d');
            context.clearRect(0, 0, this.width, this.height);

            context.drawImage(
              this.canvas,
              0,
              0,
              this.canvas.width,
              this.canvas.height,
              0,
              0,
              this.width,
              this.height,
            );

            this.canvas.toBlob((blob) => {
              resolve(blob);
            }, `image/${imageFormat}`);
          } catch (error) {
            reject(error);
          }
        });
      }
      default:
        return Promise.resolve(this.canvas);
    }
  }

  /**
   * Get this mask from the layer id or default view
   * @param {id} Number
   */
  getMaskLayer(id) {
    return this.layers.find((layer) => layer.id === id);
  }

    /**
   * Get this mask from the layer id or default view
   * @param {id} Number
   */
  getMaskLayers() {
    return this.layers.find((layer) => this.maskIds.has(layer.id));
  }

  initializeMenu() {
    let newImageSection = document.createElement('div');
    newImageSection.name = 'color-management';
    newImageSection.classList.add('section');
    var title = document.createElement('span');
    title.innerHTML = game.i18n.localize("vtta-tokenizer.label.NewImage");
    newImageSection.appendChild(title);

    // Set the mask of this layer
    this.maskControl = document.createElement('button');
    this.maskControl.classList.add('menu-button');
    var buttonText = document.createElement('i');
    buttonText.classList.add('fas', 'fa-globe');
    this.maskControl.appendChild(buttonText);
  }

  /**
   * Enables dragging
   * @param {Event} event
   */
  onMouseDown(event) {
    if (this.isColorPicking) {
      this.endColorPicking(false);
    } else if (this.isAlphaPicking) {
      this.endAlphaPicking(false);
    }

    if (this.activeLayer === null) return;
    this.redraw(true);
    this.isDragging = true;
    this.lastPosition = {
      x: event.clientX,
      y: event.clientY,
    };
  }

  /**
   * Disables dragging
   * @param {Event} event
   */
  // eslint-disable-next-line no-unused-vars
  onMouseUp(event) {
    this.redraw(true);
    if (this.activeLayer === null) return;
    this.isDragging = false;
  }

  /**
   * Enables color picking on the current view canvas and (if a drag event is registered) translation
   * of the source image on the view canvas
   * @param {Event} event
   */
  onMouseMove(event) {
    if (this.isColorPicking) {
      const eventLocation = Utils.getCanvasCords(this.canvas, event);
      // Get the data of the pixel according to the mouse pointer location
      const pixelData = this.canvas.getContext('2d').getImageData(eventLocation.x, eventLocation.y, 1, 1).data;
      // If transparency on the pixel , array = [0,0,0,0]
      if (pixelData[0] == 0 && pixelData[1] == 0 && pixelData[2] == 0 && pixelData[3] == 0) {
        // Do something if the pixel is transparent
      }
      // Convert it to HEX if you want using the rgbToHex method.
      const hex = '#' + ('000000' + Utils.rgbToHex(pixelData[0], pixelData[1], pixelData[2])).slice(-6);

      // update the layer
      // setting the color
      this.colorPickingForLayer.setColor(hex);
      // refreshing the control
      let control = this.controls.find((control) => control.layer.id === this.colorPickingForLayer.id);
      control.refresh();
      this.redraw();
    } else if (this.isAlphaPicking) {
      const eventLocation = Utils.getCanvasCords(this.canvas, event);
      const pixelData = this.canvas.getContext('2d').getImageData(eventLocation.x, eventLocation.y, 1, 1).data;
      if (pixelData[0] == 0 && pixelData[1] == 0 && pixelData[2] == 0 && pixelData[3] == 0) {
        // Do nothing if the pixel is transparent
      } else {
        this.alphaColorHex = '#' + ('000000' + Utils.rgbToHex(pixelData[0], pixelData[1], pixelData[2])).slice(-6);
        this.alphaColor = new Color({
          red: pixelData[0],
          green: pixelData[1],
          blue: pixelData[2],
          alpha: pixelData[3],
          tolerance: this.alphaTolerance,
        });
        const control = this.controls.find((control) => control.layer.id === this.alphaPickingForLayer.id);
        control.refresh();
        this.redraw();
      }
    }

    if (this.activeLayer === null) return;
    if (!this.isDragging) return;

    const delta = {
      x: this.lastPosition.x - event.clientX,
      y: this.lastPosition.y - event.clientY,
    };

    if (this.activeLayer.source !== null) {
      this.activeLayer.translate(delta.x, delta.y);
    }
    this.activeLayer.redraw();
    this.redraw(true);
    this.lastPosition = {
      x: event.clientX,
      y: event.clientY,
    };
  }

  /**
   * Scales the source image on mouse wheel events
   * @param {Event} event
   */
  onWheel(event) {
    if (this.activeLayer === null) return;
    event.preventDefault();

    if (event.shiftKey) {
      const degree = event.deltaY / 100;

      this.activeLayer.rotate(degree);
      this.activeLayer.redraw();
      this.redraw();
    } else {
      const eventLocation = Utils.getCanvasCords(this.canvas, event);
      if (this.activeLayer.source !== null) {
        const scaleDirection = event.deltaY / 100;
        const factor = 1 - (scaleDirection * 0.05);
        const dx = (eventLocation.x - this.activeLayer.position.x) * (factor - 1),
          dy = (eventLocation.y - this.activeLayer.position.y) * (factor - 1);

        this.activeLayer.scale *= factor;
        this.activeLayer.translate(dx, dy);
        this.activeLayer.redraw();
        this.redraw(true);
      }
    }
  }

  get width() {
    return this.canvas.width;
  }

  get height() {
    return this.canvas.height;
  }

  removeImageLayer(layerId) {
    let index = 0;
    for (index = 0; index <= this.layers.length; index++) {
      if (this.layers[index].id === layerId) {
        break;
      }
    }

    // if this layer provided the mask, remove that mask, too
    if (this.layers[index].providesMask) {
      this.maskIds.delete(index);
    }

    // remove any masks applied to other layers
    this.layers.forEach((l) => {
      l.appliedMaskIds.delete(layerId);
    });

    // delete this from the array
    this.layers.splice(index, 1);

    // now for the controls
    for (index = 0; index <= this.controls.length; index++) {
      if (this.controls[index].layer.id === layerId) {
        break;
      }
    }
    // remove the control first
    let control = this.controls.find((control) => control.layer.id === layerId);
    control.view.remove();

    this.controls.splice(index, 1);
    this.controls.forEach((control) => control.refresh());
    this.redraw(true);
  }

  #addLayerControls(layer, { masked, activate } = {}) {
    // add the control at the top of the control array
    const control = new Control(this.tokenizer, layer, this.layers.length - 1);
    this.controls.unshift(control);

    // add the control at the top of the control area, too
    this.controlsArea.insertBefore(control.view, this.controlsArea.firstChild);
    this.controls.forEach((control) => control.refresh());

    // Setup all listeners for this control
    control.view.addEventListener('color', (event) => {
      this.setColor(event.detail.layerId, event.detail.color);
      this.controls.forEach((control) => control.refresh());
    });
    control.view.addEventListener('color-tint', (event) => {
      this.setLayerColorTint(event.detail.layerId, event.detail.color);
      this.controls.forEach((control) => control.refresh());
    });
    control.view.addEventListener('mask', (event) => {
      this.activateMask(event.detail.layerId);
      this.controls.forEach((control) => control.refresh());
    });
    // if a default mask is applied, trigger the calculation of the mask, too
    if (masked) {
      this.activateMask(layer.id);
      this.controls.forEach((control) => control.refresh());
    }
    control.view.addEventListener('activate', (event) => {
      this.activateLayer(event.detail.layerId);
      this.controls.forEach((control) => control.refresh());
    });
    if (activate) {
      this.activateLayer(layer.id);
      this.controls.forEach((control) => control.refresh());
    }
    control.view.addEventListener('deactivate', () => {
      this.deactivateLayers();
      this.controls.forEach((control) => control.refresh());
    });
    control.view.addEventListener('center', (event) => {
      this.centerLayer(event.detail.layerId);
    });
    control.view.addEventListener('reset', (event) => {
      this.resetLayer(event.detail.layerId);
    });
    control.view.addEventListener('flip', (event) => {
      this.mirrorLayer(event.detail.layerId);
    });
    control.view.addEventListener('move', (event) => {
      // move the control in sync
      this.moveLayer(event.detail.layerId, event.detail.direction);
      this.controls.forEach((control) => control.refresh());
    });
    control.view.addEventListener('pick-color-start', (event) => {
      this.startColorPicking(event.detail.layerId);
    });
    control.view.addEventListener('pick-color-end', () => {
      this.endColorPicking(true);
    });
    control.view.addEventListener('pick-alpha-start', (event) => {
      this.startAlphaPicking(event.detail.layerId);
    });
    control.view.addEventListener('pick-alpha-end', () => {
      this.endAlphaPicking(true);
    });
    control.view.addEventListener('delete', (event) => {
      this.removeImageLayer(event.detail.layerId);
    });
    control.view.addEventListener('opacity', (event) => {
      this.setOpacity(event.detail.layerId, event.detail.opacity);
    });
    control.view.addEventListener('visible', (event) => {
      this.setLayerVisibility(event.detail.layerId);
      this.controls.forEach((control) => control.refresh());
    });
    control.view.addEventListener('blend', (event) => {
      this.setBlendMode(event.detail.layerId, event.detail.blendMode, event.detail.mask);
    });
    control.view.addEventListener('edit-mask', async (event) => {
      this.editMask(event.detail.layerId);
    });
    control.view.addEventListener('mask-layer', async (event) => {
      this.customMaskLayerToggle(event.detail.layerId, event.detail.maskLayerId);
      this.controls.forEach((control) => control.refresh());
    });
    control.view.addEventListener('transparency-level', (event) => {
      this.alphaTolerance = event.detail.tolerance;
    });
    control.view.addEventListener('reset-transparency-level', (event) => {
      this.resetTransparencyLevel(event.detail.layerId);
    });
    control.view.addEventListener('reset-mask-layer', (event) => {
      this.resetCustomMaskLayers(event.detail.layerId);
      this.controls.forEach((control) => control.refresh());
    });
    control.view.addEventListener('duplicate', (event) => {
      this.cloneLayer(event.detail.layerId);
      this.controls.forEach((control) => control.refresh());
    });
    control.view.addEventListener('magic-lasso', async (event) => {
      this.magicLasso(event.detail.layerId);
    });
    control.view.addEventListener('centre-layer', (event) => {
      this.centreLayer(event.detail.layerId);
      this.controls.forEach((control) => control.refresh());
    });
    control.view.addEventListener('scale-layer', (event) => {
      this.scaleLayer(event.detail.layerId, event.detail.percent);
      this.controls.forEach((control) => control.refresh());
    });
  }

  addLayer(layer, { masked = false, activate = false }) {
    // add the new layer on top
    this.layers.unshift(layer);
    this.calculateAllDefaultMaskLayers();
    this.redraw(true);

    this.#addLayerControls(layer, { masked, activate });
  }

  addColorLayer({ masked = false, activate = false, color = null } = {},
  ) {
    libs_logger.debug(`adding color layer with options`, {
      imgSrc: `colorLayer: ${color}`,
      masked,
      color,
      activate,
    });

    const imgOptions = {
      view: this,
      color,
      width: this.width,
      height: this.height,
    };

    const layer = Layer.fromColor(imgOptions);
    this.addLayer(layer, { masked, activate });
  }

  addImageLayer(img, { masked = false, activate = false, tintColor = null, tintLayer = false,
    position = { x: null, y: null }, scale = null, maskFromImage = false, visible = true } = {},
  ) {
    const imgSrc = Utils.isString(img.src) && !img.src.startsWith("data:image/png;base64")
      ? img.src
      : "blob-data";

    libs_logger.debug(`adding image layer ${imgSrc}`, {
      imgSrc,
      masked,
      activate,
      tintColor,
      tintLayer,
      position,
      scale,
      maskFromImage,
      visible,
    });

    const imgOptions = {
      view: this,
      img,
      canvasHeight: this.width,
      canvasWidth: this.height,
      tintColor,
      tintLayer,
      maskFromImage,
      visible,
    };

    const layer = Layer.fromImage(imgOptions);

    if (masked) {
      layer.createMask();
      layer.redraw();
    }

    if (scale) layer.scale = scale;
    if (position.x && position.y) {
      const upScaledX = layer.canvas.width * (position.x / this.width);
      const upScaledY = layer.canvas.height * (position.y / this.height);
      layer.translate(upScaledX, upScaledY);
      if (!scale) {
        const newScaleFactor = (layer.canvas.width - (Math.abs(upScaledX) * 2)) / layer.canvas.width;
        layer.scale *= newScaleFactor;
      }
    }

    this.addLayer(layer, { masked, activate });
  }

  setLayerColorTint(id, color) {
    const layer = this.layers.find((layer) => layer.id === id);
    if (layer) {
      if (color) {
        layer.tintColor = color;
        layer.tintLayer = true;
      } else {
        layer.tintColor = null;
        layer.tintLayer = false;
      }
      this.redraw(true);
    }
  }

  /**
   * Starts color picking for a given layer
   * @param {String} id The layer that is getting the picked color as a background color
   */
  startColorPicking(id) {
    const layer = this.layers.find((layer) => layer.id === id);
    layer.saveColor();
    // move the control in sync
    this.isColorPicking = true;
    this.colorPickingForLayer = layer;
    this.canvas.classList.add('isColorPicking');
  }

    /**
   * Starts alpha picking for a given layer
   * @param {String} id The layer that is getting the picked color as a alpha color
   */
  startAlphaPicking(id) {
    const layer = this.layers.find((layer) => layer.id === id);
    layer.saveAlphas();
    // move the control in sync
    this.isAlphaPicking = true;
    this.alphaPickingForLayer = layer;
    this.canvas.classList.add('isColorPicking');
  }

  resetTransparencyLevel(id) {
    const layer = this.layers.find((layer) => layer.id === id);
    if (layer) {
      layer.alphaPixelColors.clear();
      this.redraw(true);
    }
  }

  resetCustomMaskLayers(id) {
    const layer = this.layers.find((layer) => layer.id === id);
    if (layer) {
      layer.resetMasks();
      this.redraw(true);
    }
  }

  cloneLayer(id) {
    const layer = this.layers.find((layer) => layer.id === id);
    if (layer) {
      const newLayer = layer.clone();
      this.addLayer(newLayer, { masked: newLayer.providesMask, activate: false });
      this.redraw(true);
    }
  }

  centreLayer(id) {
    const layer = this.layers.find((layer) => layer.id === id);
    if (layer) {
      layer.centre();
      this.redraw(true);
    }
  }

  scaleLayer(id, percent) {
    const layer = this.layers.find((layer) => layer.id === id);
    if (layer) {
      layer.scaleByPercent(percent);
      this.redraw(true);
    }
  }


  /**
   * Ends a color picking state
   * @param {boolean} reset If the user aborted the color picking, we will reset to the original color
   */
  endColorPicking(reset = false) {
    this.canvas.classList.remove('isColorPicking');
    // move the control in sync
    this.isColorPicking = false;

    // update the layer
    if (reset) {
      // setting the color
      this.colorPickingForLayer.restoreColor();
      this.redraw(true);
    }

    // refreshing the control
    const control = this.controls.find((control) => control.layer.id === this.colorPickingForLayer.id);
    control.endColorPicking();

    this.colorPickingForLayer = null;

    control.refresh();
    this.redraw(true);
  }

  /**
   * Ends a color picking state
   * @param {boolean} reset If the user aborted the color picking, we will reset to the original color
   */
  endAlphaPicking(reset = false) {
    this.canvas.classList.remove('isColorPicking');
    // move the control in sync
    this.isAlphaPicking = false;

    // update the layer
    if (reset) {
      // setting the color
      this.alphaPickingForLayer.restoreAlphas();
      this.redraw(true);
    } else {
      this.alphaPickingForLayer.addTransparentColour(this.alphaColor);
    }

    // refreshing the control
    const control = this.controls.find((control) => control.layer.id === this.alphaPickingForLayer.id);
    control.endAlphaPicking();

    this.alphaPickingForLayer = null;

    control.refresh();
    this.redraw();
  }

  isOriginLayerHigher(originId, targetId) {
    if (!originId || !targetId) return undefined;
    const originIndex = this.layers.findIndex((layer) => layer.id === originId);
    const targetIndex = this.layers.findIndex((layer) => layer.id === targetId);
    return targetIndex > originIndex;
  }

  moveLayer(id, direction) {
    // get the index in the layers-layer for this layer;
    const sourceId = this.layers.findIndex((layer) => layer.id === id);
    // check for validity
    const targetId = sourceId == -1 
      ? -1
      : (direction === 'up') 
        ? sourceId - 1 
        : sourceId + 1;
    // check if a valid targetID was derived
    if (this.layers[targetId] !== undefined) {
      // swap the elements
      [this.layers[sourceId], this.layers[targetId]] = [this.layers[targetId], this.layers[sourceId]];
      // swap the corresponding controls, too
      const sourceControl = this.controlsArea.children[sourceId];
      const targetControl = this.controlsArea.children[targetId];

      // swap the elements and enable/disable move controls if they are at the bottom or top
      if (direction === 'up') {
        this.controlsArea.insertBefore(sourceControl, targetControl);
        if (targetId === 0) {
          this.controls[targetId].disableMoveDown();
          this.controls[sourceId].enableMoveDown();
        }
        if (targetId === this.layers.length - 1) {
          this.controls[targetId].disableMoveUp();
          this.controls[sourceId].enableMoveUp();
        }
      } else {
        this.controlsArea.insertBefore(sourceControl, targetControl.nextSibling);
      }
      this.calculateDefaultAppliedMaskLayers(this.layers[targetId].id);
      this.calculateDefaultAppliedMaskLayers(this.layers[sourceId].id);
    }
    this.redraw(true);
  }

  centerLayer(id) {
    this.resetLayer(id);
  }

  resetLayer(id) {
    const layer = this.layers.find((layer) => layer.id === id);
    if (layer !== null) {
      layer.reset();
      this.redraw(true);
    }
  }

  setBlendMode(id, blendMode, isMask) {
    const layer = this.layers.find((layer) => layer.id === id);
    if (layer !== null) {
      if (isMask) layer.maskCompositeOperation = blendMode;
      else layer.compositeOperation = blendMode;
      this.redraw(true);
    }
  }

  mirrorLayer(id) {
    const layer = this.layers.find((layer) => layer.id === id);
    if (layer !== null) {
      layer.flip();
      this.redraw();
    }
  }

  setOpacity(id, opacity) {
    const layer = this.layers.find((layer) => layer.id === id);
    if (layer !== null) {
      layer.alpha = parseInt(opacity) / 100;
      layer.redraw();
      this.redraw();
    }
  }

  setLayerVisibility(id) {
    const layer = this.layers.find((layer) => layer.id === id);
    if (layer !== null) {
      layer.visible = !layer.visible;
      this.redraw();
    }
  }

  /**
   * Activates a layer for translation/scaling
   * @param Number | null id of the layer that should activate it's mask, if null: Activate the lowest layer with id = 0
   */
  activateLayer(id = 0) {
    // set all layers to inactive
    this.layers.forEach((layer) => (layer.active = false));
    this.activeLayer = this.layers.find((layer) => layer.id === id);
    // activate the layer with given id
    if (this.activeLayer !== null) {
      this.activeLayer.active = true;
    }
    this.redraw();
  }

  /**
   * Deactives all layers (can only be one active at a time...)
   */
  deactivateLayers() {
    this.activeLayer = null;
    this.layers.forEach((layer) => (layer.active = false));
    this.redraw();
  }

  calculateDefaultAppliedMaskLayers(id) {
    const layer = this.layers.find((l) => l.id === id);
    const index = this.layers.findIndex((l) => l.id === id);

    libs_logger.debug(`Adding mask ids to layer ${index} (${id})`, layer);
    if (layer && !layer.customMaskLayers) {
      this.layers.forEach((l) => {
        if (l.providesMask && this.isOriginLayerHigher(l.id, id)) {
          libs_logger.debug(`Applying id ${l.id}`);
          layer.appliedMaskIds.add(l.id);
        } else {
          libs_logger.debug(`Deleting id ${l.id}`);
          layer.appliedMaskIds.delete(l.id);
        }
      });
    }
  }

  calculateAllDefaultMaskLayers() {
    this.layers.forEach((layer) => {
      this.calculateDefaultAppliedMaskLayers(layer.id);
    });
  }

  /**
   * Activates the mask with the given id
   * @param Number | null id of the layer that should activate it's mask, if null: Activate the lowest layer with id = 0
   */
  activateMask(id = 0) {
    libs_logger.debug(`Toggling layer ${id} active mask`);
    // reset existing mask provision
    const layer = this.layers.find((layer) => layer.id === id);

    if (layer) {
      // check if this layer currently provides the mask
      if (layer.providesMask === true) {
        layer.providesMask = false;
        this.maskIds.delete(id);
      } else {
        layer.createMask();
        layer.redraw();
        this.maskIds.add(id);
        layer.providesMask = true;
      }

      this.calculateAllDefaultMaskLayers();
    }

    this.redraw(true);
    return true;
  }

  customMaskLayerToggle(id, maskLayerId) {
    libs_logger.debug(`Toggling custom mask layers for ${id} layer and mask ${maskLayerId}`);
    const layer = this.layers.find((l) => l.id === id);
    if (layer) {
      layer.customMaskLayers = true;

      if (layer.appliedMaskIds.has(maskLayerId)) {
        layer.appliedMaskIds.delete(maskLayerId);
      } else {
        layer.appliedMaskIds.add(maskLayerId);
      }
    }
    this.redraw(true);
  }

  editMask(id) {
    libs_logger.debug(`Editing mask for layer ${id}`);
    const layer = this.layers.find((layer) => layer.id === id);
    if (layer) {
      layer.editMask(this.redraw.bind(this));
      this.deactivateLayers();
      this.controls.forEach((control) => control.refresh());
    }
  }

  magicLasso(id) {
    libs_logger.debug(`Magic Lasso for layer ${id}`);
    const layer = this.layers.find((layer) => layer.id === id);
    if (layer) {
      layer.magicLasso(this.redraw.bind(this));
      this.deactivateLayers();
      this.controls.forEach((control) => control.refresh());
    }
  }

  // eslint-disable-next-line default-param-last
  setColor(id = 0, hexColorString) {
    const layer = this.layers.find((layer) => layer.id === id);
    if (layer !== null) {
      libs_logger.debug('Setting color for layer', { layer, hexColorString });
      layer.setColor(hexColorString);
      this.redraw(true);
    }
  }

  redraw(full = false) {
    const context = this.canvas.getContext('2d');
    context.clearRect(0, 0, this.width, this.height);

    if (full) {
      libs_logger.debug("Full redraw triggered");
      this.layers.forEach((layer) => {
        libs_logger.debug(`Recalculating mask for ${layer.id}`, layer);
        layer.recalculateMask();
      });
      this.layers.forEach((layer) => {
        libs_logger.debug(`Recalculating visual layer for ${layer.id}`, layer);
        layer.redraw();
      });
    }

    // loop through each layer, and apply the layer to the canvas
    for (let index = this.layers.length - 1; index >= 0; index--) {
      const layer = this.layers[index];
      if (layer.visible) {
        const imgSrc = Utils.isString(layer.sourceImg) && !layer.sourceImg.startsWith("data:image/png;base64")
          ? layer.sourceImg
          : "blob-data";
        libs_logger.debug(`Drawing layer ${layer.id} for ${imgSrc}`);

        context.globalCompositeOperation = layer.compositeOperation;
        context.globalAlpha = layer.alpha;

        context.drawImage(
          layer.canvas,
          0,
          0,
          layer.canvas.width,
          layer.canvas.height,
          0,
          0,
          this.width,
          this.height,
        );
      }
    }
  }
}

;// CONCATENATED MODULE: ./src/libs/ImageBrowser.js



class ImageBrowser extends FormApplication {

  static MAX_ASSETS = 100;

  static async getFileUrl (foundryFilePath, encode = true) {
    let uri;
    try {
      let dir = libs_DirectoryPicker.parse(foundryFilePath);
      if (dir.activeSource == "data" || dir.current.startsWith("https://")) {
        // Local on-server file system
        uri = dir.current;
      } else if (dir.activeSource == "forgevtt") {
        const status = ForgeAPI.lastStatus || await ForgeAPI.status();
        const userId = status.user;
        uri = "https://assets.forge-vtt.com/" + userId + "/" + dir.current;
      } else {
        // S3 Bucket
        uri
          = game.data.files.s3.endpoint.protocol
          + "//"
          + dir.bucket
          + "."
          + game.data.files.s3.endpoint.hostname
          + "/"
          + dir.current;
      }
    } catch (exception) {
      libs_logger.warn(`Unable to determine file URL for '${foundryFilePath}'`);
      throw new Error(`Unable to determine file URL for '${foundryFilePath}'`);
    }
    if (encode) {
      return encodeURI(uri);
    } else {
      return uri;
    }
  }

  constructor(assets, options) {
    super();
    this.assets = assets;
    this.type = options.type || "image";
    this.callback = options.callback;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "tokenizer-image-browser",
      classes: ["imagebrowser"],
      title: "Image Browser",
      template: "modules/vtta-tokenizer/templates/imagebrowser.hbs",
      width: 880,
      height: "auto",
      resizable: true,
      closeOnSubmit: false,
      submitOnClose: false,
    });
  }

  async getData() {
    // fetch initial asset list
    let idx = 0;
    const assets = await Promise.all(this.assets.map(async (asset) => {
      const uri = await ImageBrowser.getFileUrl(asset.key, false);
      const div = `<div class="imageresult draggable" title="${asset.label}" data-idx="${idx}"><img width="100" height="100" src="${uri}"/></div>`;
      idx++;
      return div;
    }));

    const canBrowse = game.user && game.user.can("FILES_BROWSE");

    const data = {
      canBrowse,
      assets,
    };

    return data;
  }

  activateListeners(html) {
    super.activateListeners(html);
    this.bringToTop();
    html.find("button").click(this._onClickButton.bind(this));
    html.find(".imageresult").click(this._onClickImage.bind(this));
    html.find(".list").on("scroll", this._onScroll.bind(this));

    this.html = html;
  }

  async _onClickImage(event) {
    event.preventDefault();
    const source = event.currentTarget;
    const idx = source.dataset.idx;
    this.callback(this.assets[idx].key);
    this.close();
  }

  async _onClickButton(event) {
    event.preventDefault();
    const directoryPath = game.settings.get("vtta-tokenizer", "frame-directory");
    const usePath = directoryPath === ""
      ? "[data] modules/vtta-tokenizer/img"
      : directoryPath;
    const dir = libs_DirectoryPicker.parse(usePath);
    const FPClass = foundry?.applications?.apps?.FilePicker?.implementation ?? FilePicker;
    new FPClass({
          type: 'image',
          displayMode: 'tiles',
          source: dir.activeSource,
          current: dir.current,
          options: { bucket: dir.bucket },
          callback: (imagePath, fPicker) => {
            const formattedPath = fPicker.result.bucket
              ? `[${fPicker.activeSource}:${fPicker.result.bucket}] ${imagePath}`
              : `[${fPicker.activeSource}] ${imagePath}`;
            this.callback(formattedPath);
          },
    }).render();
    this.close();
  }

  /**
   * Scroll event
   */
  async _onScroll(event) {
    if (this.ignoreScroll) return;
    const bottom
      = $(event.currentTarget).prop("scrollHeight")
      - $(event.currentTarget).scrollTop();
    const height = $(event.currentTarget).height();
    if (!this.assets) return;
    if (bottom - 20 < height) {
      this.ignoreScroll = true; // avoid multiple events to occur while scrolling
      if (
        this.assetInc * ImageBrowser.MAX_ASSETS
        < this.assets.length
      ) {
        this.assetInc++;
        this.html
          .find(".list")
          .append(
            this.assets.slice(
              this.assetInc * ImageBrowser.MAX_ASSETS,
              (this.assetInc + 1) * ImageBrowser.MAX_ASSETS,
            ),
          );
        this._reEnableListeners();
      }
      this.ignoreScroll = false;
    }
  }

  // re-enable listeners
  _reEnableListeners() {
    this.html.find("*").off();
    this.activateListeners(this.html);
    this._activateCoreListeners(this.html);
  }

}

/* harmony default export */ const libs_ImageBrowser = (ImageBrowser);

;// CONCATENATED MODULE: ./src/libs/TokenizerSaveLocations.js




const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const TokenizerSaveLocations_FPClass = foundry.applications?.apps?.FilePicker?.implementation ?? FilePicker;


class TokenizerSaveLocations extends HandlebarsApplicationMixin(ApplicationV2) {

  constructor(tokenizer) {
    super();
    this.tokenizer = tokenizer;
    this.data = [];
  }

  static PARTS = {
    form: {
      template: "modules/vtta-tokenizer/templates/save-locations/form.hbs",
    },
    footer: {
      template: "modules/vtta-tokenizer/templates/save-locations/footer.hbs",
    },
  };

    /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    id: "tokenizer-save-locations",
    classes: ["standard-form"],
    actions: {
      selectDirectory: TokenizerSaveLocations.selectDirectory,
    },
    position: {
      width: "500",
      height: "auto",
    },
    window: {
      resizable: false,
      minimizable: false,
      subtitle: "",
    },
    tag: "form",
    form: {
      handler: TokenizerSaveLocations.formHandler,
      submitOnChange: false,
      closeOnSubmit: false,
    },
  };

  // eslint-disable-next-line class-methods-use-this
  get title() {
    return game.i18n.localize("vtta-tokenizer.label.save-locations");
  }

  async _prepareContext() {
    this.data = [
      {
        key: "avatar",
        name: game.i18n.localize("vtta-tokenizer.label.avatar"),
        directoryPath: this.tokenizer.avatarUploadDirectory,
        fileName: this.tokenizer.avatarFileName,
      },
      {
        key: "token",
        name: game.i18n.localize("vtta-tokenizer.label.token"),
        directoryPath: this.tokenizer.tokenUploadDirectory,
        fileName: this.tokenizer.tokenFileName,
      },
    ];

    return { type: this.data };
  }

  static async selectDirectory(event, target) {
    const targetDirSetting = target.dataset.target;
    const currentDir = this.tokenizer[targetDirSetting];
    // const parsedDir = FileHelper.parseDirectory(currentDir);
    const current = await libs_DirectoryPicker.getFileUrl(currentDir, "");

    const filePicker = new TokenizerSaveLocations_FPClass({
      type: "folder",
      current: current,
      // source: parsedDir.activeSource,
      // activeSource: parsedDir.activeSource,
      // bucket: parsedDir.bucket,
      callback: async (path, picker) => {
        const activeSource = picker.activeSource;
        const bucket = activeSource === "s3" && picker.sources.s3?.bucket && picker.sources.s3.bucket !== ""
          ? picker.sources.s3.bucket
          : null;

        const formattedPath = libs_DirectoryPicker.format({
          activeSource,
          bucket,
          path,
        });

        this.element.querySelector(`input[name='${targetDirSetting}']`).value = formattedPath;
      },
    });
    filePicker.render();

  }


  /**
   * Process form submission for the sheet
   * @this {DDBLocationSetup}                      The handler is called with the application as its bound scope
   * @param {SubmitEvent} event                   The originating form submission event
   * @param {HTMLFormElement} form                The form element that was submitted
   * @param {FormDataExtended} formData           Processed data for the submitted form
   * @returns {Promise<void>}
   */
  static async formHandler(event, form, formData) {
    const directoryStatus = [];

    for (const dataType of this.data) {
      const value = formData.object[`${dataType.key}UploadDirectory`];
      // eslint-disable-next-line no-await-in-loop
      directoryStatus.push({
        key: dataType.key,
        value: dataType.value,
        isBad: constants.BAD_DIRS.includes(value),
        // eslint-disable-next-line no-await-in-loop
        isValid: await libs_DirectoryPicker.verifyPath(libs_DirectoryPicker.parse(value)),
      });
    }

    if (directoryStatus.some((dir) => dir.isBad)) {
      for (const data of directoryStatus.filter((dir) => dir.isBad)) {
        ui.notifications.error(
          `Please set the image upload directory for ${data.name} to something other than the root.`,
          { permanent: true },
        );
        libs_logger.error("Error setting Image directory", {
          directoryStatus,
          data,
        });
      }
    } else if (directoryStatus.some((dir) => !dir.isValid)) {
      for (const data of directoryStatus.filter((dir) => !dir.isValid)) {
        ui.notifications.error(
          `Directory Validation Failed for ${data.name} please check it exists and can be written to.`,
          { permanent: true },
        );
        libs_logger.error("Error validating Image directory", {
          directoryStatus,
          data,
        });
      }
    } else {
      this.tokenizer.avatarUploadDirectory = formData.object["avatarUploadDirectory"];
      this.tokenizer.tokenUploadDirectory = formData.object["tokenUploadDirectory"];
      this.tokenizer.avatarFileName = formData.object["avatarFileName"];
      this.tokenizer.tokenFileName = formData.object["tokenFileName"];
      libs_logger.debug("Changed tokenizer save paths to...", {
        avatarUploadDirectory: this.tokenizer.avatarUploadDirectory,
        tokenUploadDirectory: this.tokenizer.tokenUploadDirectory,
        avatarFileName: this.tokenizer.avatarFileName,
        tokenFileName: this.tokenizer.tokenFileName,
      });
      this.close();
    }

  }
}

;// CONCATENATED MODULE: ./src/tokenizer/Tokenizer.js








class Tokenizer extends FormApplication {

  getOMFGFrames() {
    if (game.settings.get(constants.MODULE_ID, "disable-omfg-frames")) return [];
    if (this.omfgFrames.length > 0) return this.omfgFrames;
    libs_logger.debug(`Checking for OMFG Token Frames files in...`);

    ["normal", "desaturated"].forEach((version) => {
      ["v2", "v3", "v4", "v7", "v12"].forEach((v) => {
        for (let i = 1; i <= 8; i++) {
          const fileName = `modules/vtta-tokenizer/img/omfg/${version}/${v}/OMFG_Tokenizer_${v}_0${i}.png`;
          const label = `OMFG ${game.i18n.localize("vtta-tokenizer.label.Frame")} ${v} 0${i}`;
          const obj = {
            key: fileName,
            label,
            selected: false,
          };
          if (!this.frames.some((frame) => frame.key === fileName)) {
            this.omfgFrames.push(obj);
          }
        }
      });
    });
    return this.omfgFrames;
  }

  async getTheGreatNachoFrames() {
    if (game.settings.get(constants.MODULE_ID, "disable-thegreatnacho-frames")) return [];
    if (this.theGreatNachoFrames.length > 0) return this.theGreatNachoFrames;
    libs_logger.debug(`Checking for GreatNacho Token Frames.`);

    for (let i = 1; i <= 20; i++) {
      const fileName = `modules/vtta-tokenizer/img/thegreatnacho/theGreatNacho-${i}.webp`;
      const label = `TheGreatNacho ${game.i18n.localize("vtta-tokenizer.label.Frame")} ${i}`;
      const obj = {
        key: fileName,
        label,
        selected: false,
      };
      if (!this.frames.some((frame) => frame.key === fileName)) {
        this.theGreatNachoFrames.push(obj);
      }
    }

    return this.theGreatNachoFrames;
  }

  async getJColsonFrames() {
    if (!game.modules.get("token-frames")?.active || game.settings.get(constants.MODULE_ID, "disable-jcolson-frames")) {
      return [];
    }
    if (this.jColsonFrames.length > 0) return this.jColsonFrames;

    const directoryPath = "[data] modules/token-frames/token_frames";
    libs_logger.debug(`Checking for JColson Token Frames files in ${directoryPath}...`);

    const dir = libs_DirectoryPicker.parse(directoryPath);
    this.jColsonFrames = await this.getDirectoryImageData(dir.activeSource, { bucket: dir.bucket }, dir.current);

    return this.jColsonFrames;
  }

  static getDefaultFrames() {
    const npcFrame = game.settings.get(constants.MODULE_ID, "default-frame-npc");
    const otherNPCFrame = game.settings.get(constants.MODULE_ID, "default-frame-neutral");
    const npcDiff = npcFrame !== otherNPCFrame;
    const setPlayerDefaultFrame = game.settings.get(constants.MODULE_ID, "default-frame-pc").replace(/^\/|\/$/g, "");
    const setNPCDefaultFrame = npcFrame.replace(/^\/|\/$/g, "");
    const tintFrame = game.settings.get(constants.MODULE_ID, "default-frame-tint");
    const setTintFrame = tintFrame.replace(/^\/|\/$/g, "");

    const defaultFrames = [
      {
        key: setTintFrame,
        label: game.i18n.localize("vtta-tokenizer.default-frame-tint.name"),
        selected: false,
      },
      {
        key: setPlayerDefaultFrame,
        label: game.i18n.localize("vtta-tokenizer.default-frame-pc.name"),
        selected: false,
      },
      {
        key: setNPCDefaultFrame,
        label: npcDiff
          ? game.i18n.localize("vtta-tokenizer.default-frame-npc.hostile")
          : game.i18n.localize("vtta-tokenizer.default-frame-npc.neutral"),
        selected: true,
      },
    ];

    const foundryDefaultPCFrame = game.settings.settings.get("vtta-tokenizer.default-frame-pc").default.replace(/^\/|\/$/g, "");
    const foundryDefaultNPCFrame = game.settings.settings.get("vtta-tokenizer.default-frame-npc").default.replace(/^\/|\/$/g, "");

    if (foundryDefaultPCFrame !== setPlayerDefaultFrame) {
      defaultFrames.push({
        key: foundryDefaultPCFrame,
        label: game.i18n.localize("vtta-tokenizer.default-frame-pc.foundry"),
        selected: false,
      });
    }
    if (foundryDefaultNPCFrame !== setNPCDefaultFrame) {
      defaultFrames.push({
        key: foundryDefaultNPCFrame,
        label: npcDiff
          ? game.i18n.localize("vtta-tokenizer.default-frame-npc.foundry-hostile")
          : game.i18n.localize("vtta-tokenizer.default-frame-npc.foundry-neutral"),
        selected: false,
      });
    }

    if (npcDiff) {
      defaultFrames.push({
        key: otherNPCFrame.replace(/^\/|\/$/g, ""),
        label: game.i18n.localize("vtta-tokenizer.default-frame-npc.other"),
        selected: false,
      });
    }

    return defaultFrames;
  }

  static generateImageData(file, prefix = "", selected = false) {
    const labelSplit = file.split("/").pop().trim();
    const regex = new RegExp(`^${prefix}-`);
    const label = labelSplit.replace(regex, "").replace(/[-_]/g, " ");
    return {
      key: file,
      label: Utils.titleString(label).split(".")[0],
      selected,
    };
  }

  async getDirectoryImageData(activeSource, options, path, type = "frame") {
    const fileList = await libs_DirectoryPicker.browse(activeSource, path, options);
    const folderImages = fileList.files
      .filter((file) => Utils.endsWithAny(["png", "jpg", "jpeg", "gif", "webp", "webm", "bmp"], file))
      .map((file) => {
        return Tokenizer.generateImageData(file, `${type}-`);
      });

    let dirImages = [];
    if (fileList.dirs.length > 0) {
      for (let i = 0; i < fileList.dirs.length; i++) {
        const dir = fileList.dirs[i];
        // eslint-disable-next-line no-await-in-loop
        const subDirImages = await this.getDirectoryImageData(activeSource, options, dir);
        dirImages.push(...subDirImages);
      }
    }
    const result = folderImages.concat(dirImages);
    return result;
  }

  async getFrames() {
    const directoryPath = game.settings.get(constants.MODULE_ID, "frame-directory");
    libs_logger.debug(`Checking for files in ${directoryPath}...`);
    const dir = libs_DirectoryPicker.parse(directoryPath);
    const folderFrames = (directoryPath && directoryPath.trim() !== "" && directoryPath.trim() !== "[data]")
      ? await this.getDirectoryImageData(dir.activeSource, { bucket: dir.bucket }, dir.current)
      : [];

    this.getOMFGFrames();
    this.getTheGreatNachoFrames();
    await this.getJColsonFrames();

    const frames = this.defaultFrames.concat(folderFrames, this.customFrames, this.omfgFrames, this.theGreatNachoFrames, this.jColsonFrames);

    this.frames = frames;
    return this.frames;
  }

  async getMasks() {
    const directoryPath = game.settings.get(constants.MODULE_ID, "masks-directory");
    libs_logger.debug(`Checking for files in ${directoryPath}...`);
    const dir = libs_DirectoryPicker.parse(directoryPath);
    const folderMasks = (directoryPath && directoryPath.trim() !== "" && directoryPath.trim() !== "[data]")
      ? await this.getDirectoryImageData(dir.activeSource, { bucket: dir.bucket }, dir.current)
      : [];

    const masks = this.defaultMasks.concat(folderMasks, this.customMasks);

    this.masks = masks;
    return this.masks;
  }

  async handleFrameSelection(framePath) {
    const frameInList = this.frames.some((frame) => frame.key === framePath);
    if (!frameInList) {
      const frame = Tokenizer.generateImageData(framePath, "frame-");
      this.frames.push(frame);
      this.customFrames.push(frame);
      game.settings.set("vtta-tokenizer", "custom-frames", this.customFrames);
    }
    this._setTokenFrame(framePath, true);
  }

  static getDefaultMasks() {
    const defaultMask = game.settings.get(constants.MODULE_ID, "default-mask-layer").replace(/^\/|\/$/g, "");

    const defaultMasks = [
      {
        key: defaultMask,
        label: game.i18n.localize("vtta-tokenizer.default-mask.name"),
        selected: true,
      },
    ];

    const foundryDefaultMask = `[data] ${constants.PATH}img/dynamic-ring-circle-mask.webp`.replace(/^\/|\/$/g, "");
    if (defaultMask !== foundryDefaultMask) {
      defaultMasks.push({
        key: foundryDefaultMask,
        label: game.i18n.localize("vtta-tokenizer.dynamic-mask.foundry"),
        selected: false,
      });
    }

    const foundryDefaultTopMask = `[data] ${constants.PATH}img/dynamic-ring-top-mask.webp`.replace(/^\/|\/$/g, "");
    if (defaultMask !== foundryDefaultTopMask) {
      defaultMasks.push({
        key: foundryDefaultTopMask,
        label: game.i18n.localize("vtta-tokenizer.dynamic-top-mask.foundry"),
        selected: false,
      });
    }

    // const foundryGridMask = `[data] ${CONSTANTS.PATH}img/dynamic-ring-circle-mask-grid.webp`.replace(/^\/|\/$/g, "");
    // if (defaultMask !== foundryGridMask) {
    //   defaultMasks.push({
    //     key: foundryGridMask,
    //     label: game.i18n.localize("vtta-tokenizer.dynamic-grid-mask.foundry"),
    //     selected: false,
    //   });
    // }

    // const foundryGridTopMask = `[data] ${CONSTANTS.PATH}img/dynamic-ring-top-mask-grid.webp`.replace(/^\/|\/$/g, "");
    // if (defaultMask !== foundryGridTopMask) {
    //   defaultMasks.push({
    //     key: foundryGridTopMask,
    //     label: game.i18n.localize("vtta-tokenizer.dynamic-grid-top-mask.foundry"),
    //     selected: false,
    //   });
    // }

    return defaultMasks;
  }

  async handleMaskSelection(maskPath) {
    const maskInList = this.masks.some((mask) => mask.key === maskPath);
    if (!maskInList) {
      const mask = Tokenizer.generateImageData(maskPath, "mask-");
      this.masks.push(mask);
      this.customMasks.push(mask);
      game.settings.set("vtta-tokenizer", "custom-masks", this.customMasks);
    }
    this._setTokenMask(maskPath, true);
  }

  getBaseUploadDirectory() {
    if (this.tokenType === "character") {
      return game.settings.get("vtta-tokenizer", "image-upload-directory");
    } else if (this.tokenType === "npc") {
      return game.settings.get("vtta-tokenizer", "npc-image-upload-directory");
    } else {
      return game.settings.get("vtta-tokenizer", "image-upload-directory");
    }
  }

  //  Options include
  //  name: name to use as part of filename identifier
  //  type: pc, npc
  //  disposition: token disposition = -1, 0, 1
  //  avatarFilename: current avatar image - defaults to null/mystery man
  //  tokenFilename: current tokenImage - defaults to null/mystery man
  //  targetFolder: folder to target, otherwise uses defaults, wildcard use folder derived from wildcard path
  //  isWildCard: is wildcard token?
  //  tokenOffset: { position: {x:0, y:0} }
  //  any other items needed in callback function, options will be passed to callback, with filenames updated to new references
  //
  constructor(options, callback) {
    super({});
    this.tokenOptions = options;
    const defaultOffset = game.settings.get(constants.MODULE_ID, "default-token-offset");
    this.tokenOffset = options.tokenOffset
      ? options.tokenOffset
      : { position: { x: defaultOffset, y: defaultOffset } };
    this.callback = callback;
    this.modifyAvatar = !game.settings.get(constants.MODULE_ID, "token-only-toggle");
    this.modifyToken = true;
    // frames
    this.defaultFrames = Tokenizer.getDefaultFrames();
    this.frames = [];
    this.omfgFrames = [];
    this.theGreatNachoFrames = [];
    this.jColsonFrames = [];
    this.customFrames = game.settings.get(constants.MODULE_ID, "custom-frames");
    this.addMask = game.settings.get(constants.MODULE_ID, "add-mask-default");
    // masks
    this.defaultMasks = Tokenizer.getDefaultMasks();
    this.masks = [];
    this.customMasks = game.settings.get(constants.MODULE_ID, "custom-masks");
    this.addFrame = game.settings.get(constants.MODULE_ID, "add-frame-default");
    // colors
    this.defaultColor = game.settings.get(constants.MODULE_ID, "default-color");
    this.tokenType = this.tokenOptions.type === "pc" ? "pc" : "npc";
    this.nameSuffix = this.tokenOptions.nameSuffix ? this.tokenOptions.nameSuffix : "";
    this.imageFormat = game.settings.get(constants.MODULE_ID, "image-save-type");
    // add some default file names, these will likely be changed
    this.wildCardPath = undefined;
    this.avatarUploadDirectory = this.getOverRidePath(false) || this.getBaseUploadDirectory();
    this.tokenUploadDirectory = this.getOverRidePath(true) || this.getBaseUploadDirectory();
    this.avatarFileName = `${this.tokenOptions.name}.Avatar${this.nameSuffix}.${this.imageFormat}`;
    this.tokenFileName = `${this.tokenOptions.name}.Token${this.nameSuffix}.${this.imageFormat}`;
    this.activeLayerSelectorElement = null;
  }

  /**
   * Define default options for the PartySummary application
   */
  static get defaultOptions() {
    const options = super.defaultOptions;
    options.template = "modules/vtta-tokenizer/templates/tokenizer.hbs";
    options.id = "tokenizer-control";
    options.width = "auto"; // "1019";
    options.height = "auto"; // "813";
    options.classes = ["tokenizer"];
    return options;
  }

  /* -------------------------------------------- */

  async getData() {
    const frames = await this.getFrames();
    const masks = await this.getMasks();
    const pasteTarget = game.settings.get(constants.MODULE_ID, "paste-target");
    const pasteTargetName = Utils.titleString(pasteTarget);

    return {
      options: this.tokenOptions,
      canUpload: game.user && game.user.can("FILES_UPLOAD"), // game.user.isTrusted || game.user.isGM,
      canBrowse: game.user && game.user.can("FILES_BROWSE"),
      tokenVariantsEnabled: game.user && game.user.can("FILES_BROWSE") && game.modules.get("token-variants")?.active,
      frames,
      masks,
      pasteTarget,
      pasteTargetName,
      modifyAvatar: this.modifyAvatar,
    };
  }

  getWildCardPath() {
    if (!this.tokenOptions.isWildCard) return undefined;
    this.wildCardPath = this.tokenOptions.tokenFilename
      ? Utils.dirPath(this.tokenOptions.tokenFilename)
      : `${this.tokenUploadDirectory}`;
    return this.wildCardPath;
  }

  getOverRidePath(isToken) {
    let path;
    if (isToken && this.tokenOptions.isWildCard) {
      path = this.getWildCardPath();
    }
    if (!path) {
      path = this.tokenOptions.targetFolder
        ? this.tokenOptions.targetFolder
        : undefined;
    }
    return path;
  }

  async _getFilename(suffix = "Avatar", postfix = "") {
    const actorName = await Utils.makeSlug(this.tokenOptions.name);

    if (suffix === "Token" && this.tokenOptions.isWildCard) {
      // for wildcards we respect the current path of the existing/provided tokenpath
      const dirOptions = libs_DirectoryPicker.parse(this.wildCardPath);
      const tokenWildcard = this.tokenOptions.tokenFilename.indexOf("*") === -1
        // set it to a wildcard we can actually use
        ? `${dirOptions.current}/${actorName}.Token-*.${this.imageFormat}`
        : this.tokenOptions.tokenFilename.endsWith(`.${this.imageFormat}`)
          ? this.tokenOptions.tokenFilename
          : `${this.tokenOptions.tokenFilename}.${this.imageFormat}`;

      const FPClass = foundry?.applications?.apps?.FilePicker?.implementation ?? FilePicker;
      const browser = await FPClass.browse(dirOptions.activeSource, tokenWildcard, {
        wildcard: true,
      });

      const newCount = browser.files.length + 1;
      const num = newCount.toString().padStart(3, "0");
      const targetFilename = tokenWildcard.replace(/\*/g, num).split("/").pop();

      return targetFilename;
    }
    return `${actorName}.${suffix}${postfix}.${this.imageFormat}`;
  }

  async updateToken(dataBlob) {
    if (this.modifyToken) {
      this.tokenOptions.tokenUploadDirectory = this.tokenUploadDirectory;
      const filePath = await Utils.uploadToFoundry(dataBlob, this.tokenUploadDirectory, this.tokenFileName);
      libs_logger.debug(`Created token at ${filePath}`);
      this.tokenOptions.tokenFilename = filePath;
    }
  }

  async updateAvatar(dataBlob) {
    if (this.modifyAvatar) {
      this.tokenOptions.avatarUploadDirectory = this.avatarUploadDirectory;
      const filePath = await Utils.uploadToFoundry(dataBlob, this.avatarUploadDirectory, this.avatarFileName);
      libs_logger.debug(`Created avatar at ${filePath}`);
      this.tokenOptions.avatarFilename = filePath;
    }
  }

  // eslint-disable-next-line no-unused-vars
  _updateObject(event, formData) {
    // upload token and avatar
    // get the data
    Promise.all([this.Avatar.get("blob"), this.Token.get("blob")]).then(async (dataResults) => {
      await this.updateAvatar(dataResults[0]);
      await this.updateToken(dataResults[1]);

      this.callback(this.tokenOptions);
    });
  }

  /* -------------------------------------------- */

  async _initAvatar(inputUrl) {
    const url = inputUrl ?? CONST.DEFAULT_TOKEN ?? 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    const avatarView = document.querySelector(".avatar > .view");
    if (this.Avatar) {
      this.Avatar.canvas.remove();
      this.Avatar.stage.remove();
      this.Avatar.controlsArea.remove();
      this.Avatar.menu.remove();
    }
    this.Avatar = null;
    try {
      const img = await Utils.download(url);
      const MAX_DIMENSION = Math.max(img.naturalHeight, img.naturalWidth, game.settings.get(constants.MODULE_ID, "portrait-size"));
      libs_logger.debug("Setting Avatar dimensions to " + MAX_DIMENSION + "x" + MAX_DIMENSION);
      this.Avatar = new View(this, MAX_DIMENSION, avatarView);
      this.Avatar.addImageLayer(img);

      // Setting the height of the form to the desired auto height
      $("#tokenizer-control").css("height", "auto");
    } catch (error) {
      if (inputUrl) {
        const error = game.i18n.format("vtta-tokenizer.notification.failedInput", { url });
        ui.notifications.error(error);
        await this._initAvatar();
      } else {
        ui.notifications.error(game.i18n.localize("vtta-tokenizer.notification.failedFallback"));
      }
    }

    $("#avatar-options :input").attr("disabled", !this.modifyAvatar);
    $("#tokenizer-avatar :input").attr("disabled", !this.modifyAvatar);
    $("#token-options :input").attr("disabled", !this.modifyToken);
    $("#tokenizer-token :input").attr("disabled", !this.modifyToken);
  }

  activateListeners(html) {
    this.loadImages();

    $("#tokenizer .file-picker-thumbs").click((event) => {
        event.preventDefault();
        const eventTarget = event.target == event.currentTarget ? event.target : event.currentTarget;

        switch (eventTarget.dataset.type) {
          case "mask": {
            const picker = new libs_ImageBrowser(this.masks, { type: "image", callback: this.handleMaskSelection.bind(this) });
            picker.render(true);
            break;
          }
          case "frame": {
            const picker = new libs_ImageBrowser(this.frames, { type: "image", callback: this.handleFrameSelection.bind(this) });
            picker.render(true);
            break;
          }
          // no default
        }
    });

    $("#tokenizer .filePickerTarget").on("change", (event) => {
      const eventTarget = event.target == event.currentTarget ? event.target : event.currentTarget;
      const view = eventTarget.dataset.target === "avatar" ? this.Avatar : this.Token;

      Utils.download(eventTarget.value)
        .then((img) => view.addImageLayer(img))
        .catch((error) => ui.notifications.error(error));
    });

    $("#tokenizer button.invisible-button").click(async (event) => {
      event.preventDefault();
    });

    $("#tokenizer button.box-button").click(async (event) => {
      event.preventDefault();
      const eventTarget = event.target == event.currentTarget ? event.target : event.currentTarget;

      switch (eventTarget.dataset.type) {
        case "modify-toggle": {
          const button = document.getElementById(`modify-${eventTarget.dataset.target}`);
          const fas = document.getElementById(`modify-${eventTarget.dataset.target}-fas`);
          const newState = eventTarget.dataset.target === "avatar"
            ? !this.modifyAvatar
            : !this.modifyToken; 
          
          fas.classList.toggle("fa-regular");
          fas.classList.toggle("fas");
          fas.classList.toggle("fa-square");
          fas.classList.toggle("fa-square-check");

          $(`#${eventTarget.dataset.target}-options :input`).attr("disabled", !newState);
          $(`#tokenizer-${eventTarget.dataset.target} :input`).attr("disabled", !newState);

          if (eventTarget.dataset.target === "avatar") {
            this.modifyAvatar = newState;
          } else {
            this.modifyToken = newState;
          }

          button.classList.toggle('deselected');
          fas.classList.toggle('deselected');
          break;
        }
        case "paste-toggle": {
          const target = eventTarget.dataset.target;
          const avatarButton = document.getElementById(`paste-avatar`);
          const avatarFas = document.getElementById(`paste-avatar-fas`);
          const tokenButton = document.getElementById(`paste-token`);
          const tokenFas = document.getElementById(`paste-token-fas`);
          game.settings.set("vtta-tokenizer", "paste-target", target);

          avatarButton.classList.toggle('deselected');
          avatarFas.classList.toggle("fa-circle");
          avatarFas.classList.toggle("fa-circle-dot");
          tokenButton.classList.toggle('deselected');
          tokenFas.classList.toggle("fa-circle");
          tokenFas.classList.toggle("fa-circle-dot");

        }
        // no default
      }
    });

    $("#tokenizer button.menu-button").click(async (event) => {
      event.preventDefault();
      const eventTarget = event.target == event.currentTarget ? event.target : event.currentTarget;
      const view = eventTarget.dataset.target === "avatar" ? this.Avatar : this.Token;

      switch (eventTarget.dataset.type) {
        case "upload": {
          const img = await Utils.upload();
          view.addImageLayer(img);
          break;
        }
        case "download-token": {
          const filename = this.tokenFileName;
          const blob = await this.Token.get("blob");
          const file = new File([blob], filename, { type: blob.type });
          let a = document.createElement("a");
          a.href = URL.createObjectURL(file);
          a.download = filename;
          a.click();
          break;
        }
        case "download": {
          // show dialog, then download
          let urlPrompt = new Dialog({
            title: "Download from the internet",
            content: `
                      <p>${game.i18n.localize("vtta-tokenizer.download.url")}.</p>
                      <form>
                      <div class="form-group">
                         <label>URL</label>
                         <input id="tokenizerurl" type="text" name="tokenizerurl" placeholder="https://" data-dtype="String">
                      </div>
                      </form>`,
            buttons: {
              cancel: {
                icon: '<i class="fas fa-times"></i>',
                label: game.i18n.localize("vtta-tokenizer.label.Cancel"),
                callback: () => libs_logger.debug("Cancelled"),
              },
              ok: {
                icon: '<i class="fas fa-check"></i>',
                label: game.i18n.localize("vtta-tokenizer.label.OK"),
                callback: () => {
                  Utils.download($("#tokenizerurl").val())
                    .then((img) => view.addImageLayer(img))
                    .catch((error) => {
                      libs_logger.error("Error fetching image", error);
                      ui.notification.error(error);
                    });
                },
              },
            },
          });

          urlPrompt.render(true);

          break;
        }
        case "token": {
          this.Token.get("img").then((img) => view.addImageLayer(img));
          break;
        }
        case "avatar": {
          this.Avatar.get("img").then((img) => view.addImageLayer(img, { activate: true }));
          break;
        }
        case "color": {
          const defaultColor = game.settings.get(constants.MODULE_ID, "default-color");
          view.addColorLayer({ color: defaultColor });
          break;
        }
        case "tokenVariants": {
          game.modules.get('token-variants').api.showArtSelect(this.tokenOptions.name, {
            callback: (imgSrc) => Utils.download(imgSrc).then((img) => view.addImageLayer(img)),
            searchType: eventTarget.dataset.target === "avatar" ? "Portrait" : "Token",
          });
          break;
        }
        case "locations": {
          const locations = new TokenizerSaveLocations(this);
          locations.render(true);
          break;
        }
        // no default
      }
    });

    super.activateListeners(html);
  }

  async _addBaseTokenLayers() {
    if (game.settings.get(constants.MODULE_ID, "default-color-layer")) {
      this.Token.addColorLayer({ color: this.defaultColor });
    }
    if (game.settings.get(constants.MODULE_ID, "enable-default-texture-layer")) {
      await this._addTokenTexture();
    }
  }

  async _addHigherTokenLayers() {
    if (this.addFrame) {
      libs_logger.debug("Loading default token frame");
      await this._setTokenFrame();
    }
    if (this.addMask) {
      libs_logger.debug("Loading default token mask");
      await this._setTokenMask();
    }
  }

  async _initWildCardToken() {
    await this._addBaseTokenLayers();
    await this._addHigherTokenLayers();
  }

  async _initToken(src) {
    let imgSrc = src ?? CONST.DEFAULT_TOKEN;
    try {
      libs_logger.debug("Initializing Token, trying to download", imgSrc);
      const img = await Utils.download(imgSrc);
      libs_logger.debug("Got image", img);

      await this._addBaseTokenLayers();
      // if we add a frame by default offset the token image
      const options = this.addFrame || this.addMask
        ? this.tokenOffset
        : {};
      this.Token.addImageLayer(img, options);
      await this._addHigherTokenLayers();
    } catch (error) {
      if (!src || src === CONST.DEFAULT_TOKEN) {
        libs_logger.error(`Failed to load fallback token: "${imgSrc}"`);
      } else {
        const errorMessage = game.i18n.format("vtta-tokenizer.notification.failedLoad", { imgSrc, default: CONST.DEFAULT_TOKEN });
        ui.notifications.error(errorMessage);
        libs_logger.error("Failed to init image", errorMessage);
        await this._initToken();
      }
    }
  }

  #getNPCFrame() {
    const tintFrame = game.settings.get(constants.MODULE_ID, "frame-tint");
    let npcFrame;
    if (tintFrame) {
      npcFrame = game.settings.get(constants.MODULE_ID, "default-frame-tint");
    } else {
      switch (parseInt(this.tokenOptions.disposition)) {
        case 0: 
        case 1: {
          npcFrame = game.settings.get(constants.MODULE_ID, "default-frame-neutral");
          break;
        }
        
        case -1:
        default: {
          npcFrame = game.settings.get(constants.MODULE_ID, "default-frame-npc");
          break;
        }
      }
    }
    return npcFrame;
  }

  #getTintColor() {
    if (this.tokenType === "pc") {
      return game.settings.get(constants.MODULE_ID, "default-frame-tint-pc");
    }
    switch (parseInt(this.tokenOptions.disposition)) {
      case 0: {
        return game.settings.get(constants.MODULE_ID, "default-frame-tint-neutral");
      }
      case 1: {
        return game.settings.get(constants.MODULE_ID, "default-frame-tint-friendly");
      }
      case -1:
      default: {
        return game.settings.get(constants.MODULE_ID, "default-frame-tint-hostile");
      }
    }
  }

  async _setTokenFrame(fileName, fullPath = false) {
    // load the default frame, if there is one set
    const tintFrame = game.settings.get(constants.MODULE_ID, "frame-tint");
    const npcFrame = this.#getNPCFrame();

    const frameTypePath = this.tokenType === "pc"
      ? tintFrame
        ? game.settings.get(constants.MODULE_ID, "default-frame-tint")
        : game.settings.get(constants.MODULE_ID, "default-frame-pc")
      : npcFrame;
    const isDefault = fileName != npcFrame.replace(/^\/|\/$/g, "");

    const framePath = fileName && !isDefault
      ? `${game.settings.get(constants.MODULE_ID, "frame-directory")}/${fileName}`
      : fileName && isDefault
        ? fileName.replace(/^\/|\/$/g, "")
        : frameTypePath.replace(/^\/|\/$/g, "");

    const tintColor = this.#getTintColor();

    if (framePath && framePath.trim() !== "") {
      const options = libs_DirectoryPicker.parse(fullPath ? fileName : framePath);
      try {
        const img = await Utils.download(options.current);
        this.Token.addImageLayer(img, { masked: true, onTop: true, tintColor, tintLayer: tintFrame && !fileName });
      } catch (error) {
        const errorMessage = game.i18n.format("vtta-tokenizer.notification.failedLoadFrame", { frame: options.current });
        ui.notifications.error(errorMessage);
      }
    }
  }

  async _setTokenMask(fileName, fullPath = false) {
    const defaultMaskPath = game.settings.get(constants.MODULE_ID, "default-mask-layer");
    const isDefault = fileName != defaultMaskPath.replace(/^\/|\/$/g, "");

    const maskPath = fileName && !isDefault
      ? `${game.settings.get(constants.MODULE_ID, "masks-directory")}/${fileName}`
      : fileName && isDefault
        ? fileName.replace(/^\/|\/$/g, "")
        : defaultMaskPath.replace(/^\/|\/$/g, "");
        
    if (maskPath && maskPath.trim() !== "") {
      const options = libs_DirectoryPicker.parse(fullPath ? fileName : maskPath);
      try {
        const img = await Utils.download(options.current);
        this.Token.addImageLayer(img, { masked: true, onTop: true, maskFromImage: true, visible: false });
      } catch (error) {
        const errorMessage = game.i18n.format("vtta-tokenizer.notification.failedLoadMask", { mask: options.current });
        ui.notifications.error(errorMessage);
      }
    }
  }

  async _addTokenTexture(fileName, fullPath = false) {
    // load the default frame, if there is one set
    const tintLayerColour = game.settings.get(constants.MODULE_ID, "default-texture-layer-tint");
    const tintLayerPath = game.settings.get(constants.MODULE_ID, "default-texture-layer");
    const tintColor = tintLayerColour.trim() !== "" ? tintLayerColour : undefined;

    if (tintLayerPath && tintLayerPath.trim() !== "") {
      const options = libs_DirectoryPicker.parse(fullPath ? fileName : tintLayerPath.replace(/^\/|\/$/g, ""));
      try {
        const img = await Utils.download(options.current);
        this.Token.addImageLayer(img, { masked: true, onTop: true, tintColor, tintLayer: tintLayerPath && tintColor });
      } catch (error) {
        const errorMessage = game.i18n.format("vtta-tokenizer.notification.failedLoadTexture", { texture: options.current });
        ui.notifications.error(errorMessage);
      }
    }
  }

  pasteImage(event) {
    const pasteTarget = game.settings.get(constants.MODULE_ID, "paste-target");
    const view = pasteTarget === "token" ? this.Token : this.Avatar;
    Utils.extractImage(event, view);
  }

  loadImages() {
    let tokenView = document.querySelector(".token > .view");

    // get the target filename for the avatar
    this._getFilename("Avatar", this.nameSuffix).then((targetFilename) => {
      $('input[name="targetAvatarFilename"]').val(targetFilename);
      this.avatarFileName = targetFilename;
    });
    // get the target filename for the token
    this._getFilename("Token", this.nameSuffix).then((targetFilename) => {
      // $('span[name="targetPath"]').text(targetFilename);
      $('span[name="targetFilename"]').text(targetFilename);
      $('input[name="targetTokenFilename"]').val(targetFilename);
      this.tokenFileName = targetFilename;
    });

    if (this.tokenOptions.isWildCard) {
      const header = document.getElementById("tokenizer-token-header");
      header.innerText = `${game.i18n.localize("vtta-tokenizer.label.token")} (${game.i18n.localize("vtta-tokenizer.label.Wildcard")})`;
      this.Token = new View(this, game.settings.get(constants.MODULE_ID, "token-size"), tokenView);
      // load the default frame, if there is one set
      this._initWildCardToken();
    } else {
      this.Token = new View(this, game.settings.get(constants.MODULE_ID, "token-size"), tokenView);

      // Add the actor image to the token view
      this._initToken(this.tokenOptions.tokenFilename);
    }

    this._initAvatar(this.tokenOptions.avatarFilename);
  }

}

Hooks.on("renderTokenizer", (app) => {
  window.addEventListener("paste", async (e) => {
    game.canvas.layers.forEach((layer) => {
      layer._copy = [];
    });
    e.stopPropagation();
    app.pasteImage(e);
  });
  window.addEventListener("drop", async (e) => {
    e.stopPropagation();
    app.pasteImage(e);
  });
  app._element[0].addEventListener("mousedown", async (e) => {
    // this handles clearing if the selector pop ups when a non popup is clicked
    if (!app.activeLayerSelectorElement) return;
    if (!app.activeLayerSelectorElement.contains(e.target)
     && !app.lastControlButtonClicked.contains(e.target)
    ) {
      e.preventDefault();
      app.activeLayerSelectorElement.classList.remove("show");
      app.activeLayerSelectorElement = null;
      app.lastControlButtonClicked = null;
    }
  }, false);
});

;// CONCATENATED MODULE: ./src/tokenizer/AutoTokenize.js



class AutoTokenize extends FormApplication {
  /** @override */
  constructor(object = {}, options = {}) {
    super(object, options);
    this.pack = object;
    this.packName = object.metadata.label;
    this.defaultFrame = game.settings.get("vtta-tokenizer", "default-frame-npc");
  }

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "auto-tokenize",
      classes: ["tokenizer"],
      title: "Auto Tokenize",
      template: "modules/vtta-tokenizer/templates/auto.hbs",
      width: 350,
    });
  }

  /** @override */
  // eslint-disable-next-line class-methods-use-this
  async getData() {
    const data = {
      packName: this.packName,
      length: this.pack.index.size,
    };
    return {
      data,
      cssClass: "tokenizer-window",
    };

  }

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);
    html.find(".dialog-button").on("click", this._dialogButton.bind(this));
  }

  static _renderCompleteDialog(title, content) {
    new Dialog(
      {
        title,
        content,
        buttons: { two: { label: "OK" } },
      },
      {
        classes: ["dialog", "auto-complete"],
        template: "modules/vtta-tokenizer/templates/auto-complete.hbs",
      },
    ).render(true);
  }

  async tokenizePack() {
    let currentCount = 1;
    const tokenIndex = this.pack.index.filter((i) => i.name !== "#[CF_tempEntity]");
    const totalCount = tokenIndex.length;
    for (const i of tokenIndex) {
      AutoTokenize._updateProgress(totalCount, currentCount, "token", i.name);
      libs_logger.debug(`Tokenizing ${i.name}`);
      // eslint-disable-next-line no-await-in-loop
      const actor = await this.pack.getDocument(i._id);
      // eslint-disable-next-line no-await-in-loop
      await autoToken(actor, { nameSuffix: `.${this.pack.metadata.name.toLowerCase()}` });
      currentCount++;
    }
  }

  async _dialogButton(event) {
    event.preventDefault();
    event.stopPropagation();

    try {
      $(".import-progress").toggleClass("import-hidden");
      $(".tokenizer-overlay").toggleClass("import-invalid");

      await this.tokenizePack();

      $(".tokenizer-overlay").toggleClass("import-invalid");

      AutoTokenize._renderCompleteDialog(
        game.i18n.format("vtta-tokenizer.auto.success", { packName: this.packName }), 
        {
          title: this.packName,
          description: game.i18n.format("vtta-tokenizer.auto.success-content", { size: this.pack.index.size }),
        },
      );

      this.close();
    } catch (err) {
      $(".tokenizer-overlay").toggleClass("import-invalid");
      const errorText = game.i18n.format("vtta-tokenizer.auto.error", { packName: this.packName });
      ui.notifications.error(errorText);
      libs_logger.error(errorText, err);
      this.close();
    }

  }

  static _updateProgress(total, count, type, note = "") {
    const localizedType = `vtta-tokenizer.label.${type}`;
    $(".import-progress-bar")
      .width(`${Math.trunc((count / total) * 100)}%`)
      .html(`<span>${game.i18n.localize("vtta-tokenizer.label.Working")} (${game.i18n.localize(localizedType)})... ${note}</span>`);
  }

  static _progressNote(note) {
    $(".import-progress-bar")
      .html(`<span>${game.i18n.localize("vtta-tokenizer.label.Working")} (${note})...</span>`);
  }
}

;// CONCATENATED MODULE: ./src/libs/ImagePicker.js


/**
 * Game Settings: ImagePicker
 */

const ImagePicker_FPClass = foundry?.applications?.apps?.FilePicker?.implementation ?? FilePicker;

class ImagePicker extends ImagePicker_FPClass {
  constructor(options = {}) {
    super(options);
  }

  _onSubmit(event) {
    event.preventDefault();
    const path = event.target.file.value;
    const activeSource = this.activeSource;
    const bucket = event.target.bucket ? event.target.bucket.value : null;
    this.field.value = ImagePicker.format({
      activeSource,
      bucket,
      path,
    });
    this.close();
  }

  static async uploadToPath(path, file) {
    const options = libs_DirectoryPicker.parse(path);
    return ImagePicker_FPClass.upload(options.activeSource, options.current, file, { bucket: options.bucket });
  }

  // returns the type "Img" for rendering the SettingsConfig
  static Img(val) {
    return val === null ? '' : String(val);
  }

  // formats the data into a string for saving it as a GameSetting
  static format(value) {
    return value.bucket !== null
      ? `[${value.activeSource}:${value.bucket}] ${value.path}`
      : `[${value.activeSource}] ${value.path}`;
  }

  // parses the string back to something the FilePicker can understand as an option
  static parse(inStr) {
    const str = inStr ?? '';
    let matches = str.match(/\[(.+)\]\s*(.+)?/u);
    if (matches) {
      let [, source, current = ''] = matches;
      current = current.trim();
      const [s3, bucket] = source.split(":");
      if (bucket !== undefined) {
        return {
          activeSource: s3,
          bucket: bucket,
          current: current,
        };
      } else {
        return {
          activeSource: s3,
          bucket: null,
          current: current,
        };
      }
    }
    // failsave, try it at least
    return {
      activeSource: "data",
      bucket: null,
      current: str,
    };
  }

  // Adds a FilePicker-Simulator-Button next to the input fields
  static processHtml(html) {
    $(html)
      .find(`input[data-dtype="Img"]`)
      .each((index, element) => {
        // $(element).prop("readonly", true);
        
        if (!$(element).next().length) {
          let picker = new ImagePicker({
            field: $(element)[0],
            ...ImagePicker.parse(this.value),
          });
          // data-type="image" data-target="img"
          let pickerButton = $(
            '<button type="button" class="file-picker" title="Pick image"><i class="fas fa-file-import fa-fw"></i></button>',
          );
          pickerButton.on("click", () => {
            picker.render(true);
          });
          $(element).parent().append(pickerButton);
        }
      });
  }


  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    // remove unnecessary elements
    $(html).find("footer button").text("Select Image");
  }
}

// eslint-disable-next-line no-unused-vars
Hooks.on("renderSettingsConfig", (app, html, user) => {
  ImagePicker.processHtml(html);
});

/* harmony default export */ const libs_ImagePicker = (ImagePicker);

;// CONCATENATED MODULE: ./src/settings.js




class ResetCustomFrames extends FormApplication {
  static get defaultOptions() {
    const options = super.defaultOptions;
    options.id = "cleanup-custom-frames";
    options.template = `${constants.PATH}/templates/cleanup.hbs`;
    return options;
  }

  // eslint-disable-next-line class-methods-use-this
  get title() {
    return "Reset Custom Frames";
  }

  /** @override */
  // eslint-disable-next-line class-methods-use-this
  async getData() {
    return {
      labels: {
        name: game.i18n.localize(`${constants.MODULE_ID}.reset-custom-frames.name`),
        list: game.i18n.localize(`${constants.MODULE_ID}.reset-custom-frames.list`),
      },
    };
  }

  /** @override */
  // eslint-disable-next-line class-methods-use-this
  async _updateObject() {
    game.settings.set(constants.MODULE_ID, "custom-frames", []);
  }
}

class ResetCustomMasks extends FormApplication {
  static get defaultOptions() {
    const options = super.defaultOptions;
    options.id = "cleanup-custom-masks";
    options.template = `${constants.PATH}/templates/cleanup.hbs`;
    return options;
  }

  // eslint-disable-next-line class-methods-use-this
  get title() {
    return "Reset Custom Masks";
  }

  /** @override */
  // eslint-disable-next-line class-methods-use-this
  async getData() {
    return {
      labels: {
        name: game.i18n.localize(`${constants.MODULE_ID}.reset-custom-masks.name`),
        list: game.i18n.localize(`${constants.MODULE_ID}.reset-custom-masks.list`),
      },
    };
  }

  /** @override */
  // eslint-disable-next-line class-methods-use-this
  async _updateObject() {
    game.settings.set(constants.MODULE_ID, "custom-masks", []);
  }
}

class QuickSettings extends FormApplication {
  static get defaultOptions() {
    const options = super.defaultOptions;
    options.id = "quick-settings";
    options.template = `${constants.PATH}/templates/quick-settings.hbs`;
    return options;
  }

  // eslint-disable-next-line class-methods-use-this
  get title() {
    return game.i18n.localize(`${constants.MODULE_ID}.quick-settings.label`);
  }

  /** @override */
  // eslint-disable-next-line class-methods-use-this
  async getData() {
    return {
      labels: {
        description: game.i18n.localize(`${constants.MODULE_ID}.quick-settings.description`),
        "tokenring-colour": {
          label: game.i18n.localize(`${constants.MODULE_ID}.quick-settings.tokenring-colour.label`),
          description: game.i18n.localize(`${constants.MODULE_ID}.quick-settings.tokenring-colour.description`),
        },
        "tokenring-texture": {
          label: game.i18n.localize(`${constants.MODULE_ID}.quick-settings.tokenring-texture.label`),
          description: game.i18n.localize(`${constants.MODULE_ID}.quick-settings.tokenring-texture.description`),
        },
        "tokenring-transparent": {
          label: game.i18n.localize(`${constants.MODULE_ID}.quick-settings.tokenring-transparent.label`),
          description: game.i18n.localize(`${constants.MODULE_ID}.quick-settings.tokenring-transparent.description`),
        },
        dynamicring: {
          label: game.i18n.localize(`${constants.MODULE_ID}.quick-settings.dynamicring.label`),
          description: game.i18n.localize(`${constants.MODULE_ID}.quick-settings.dynamicring.description`),
        },
        nothing: {
          label: game.i18n.localize(`${constants.MODULE_ID}.quick-settings.nothing.label`),
          description: game.i18n.localize(`${constants.MODULE_ID}.quick-settings.nothing.description`),
        },
      },
    };
  }

  /** @override */
  // eslint-disable-next-line class-methods-use-this
  async _updateObject(event) {
    switch (event.submitter.id) {
      case "tokenring-colour": {
        await game.settings.set(constants.MODULE_ID, "add-frame-default", true);
        await game.settings.set(constants.MODULE_ID, "default-color-layer", true);
        await game.settings.set(constants.MODULE_ID, "add-mask-default", false);
        await game.settings.set(constants.MODULE_ID, "enable-default-texture-layer", false);
        await game.settings.set(constants.MODULE_ID, "default-token-offset", game.settings.settings.get(`${constants.MODULE_ID}.default-token-offset`).default);
        await game.settings.set(constants.MODULE_ID, "token-size", game.settings.settings.get(`${constants.MODULE_ID}.token-size`).default);
        await game.settings.set(constants.MODULE_ID, "auto-apply-dynamic-token-ring", false);
        // game.settings.set(CONSTANTS.MODULE_ID, "frame-tint", false);
        break;
      }
      case "tokenring-texture": {
        await game.settings.set(constants.MODULE_ID, "add-frame-default", true);
        await game.settings.set(constants.MODULE_ID, "default-color-layer", false);
        await game.settings.set(constants.MODULE_ID, "add-mask-default", false);
        await game.settings.set(constants.MODULE_ID, "enable-default-texture-layer", true);
        await game.settings.set(constants.MODULE_ID, "default-token-offset", game.settings.settings.get(`${constants.MODULE_ID}.default-token-offset`).default);
        await game.settings.set(constants.MODULE_ID, "token-size", game.settings.settings.get(`${constants.MODULE_ID}.token-size`).default);
        await game.settings.set(constants.MODULE_ID, "auto-apply-dynamic-token-ring", false);
        // game.settings.set(CONSTANTS.MODULE_ID, "frame-tint", false);
        break;
      }
      case "tokenring-transparent": {
        await game.settings.set(constants.MODULE_ID, "add-frame-default", true);
        await game.settings.set(constants.MODULE_ID, "default-color-layer", false);
        await game.settings.set(constants.MODULE_ID, "add-mask-default", false);
        await game.settings.set(constants.MODULE_ID, "enable-default-texture-layer", false);
        await game.settings.set(constants.MODULE_ID, "default-token-offset", game.settings.settings.get(`${constants.MODULE_ID}.default-token-offset`).default);
        await game.settings.set(constants.MODULE_ID, "token-size", game.settings.settings.get(`${constants.MODULE_ID}.token-size`).default);
        await game.settings.set(constants.MODULE_ID, "auto-apply-dynamic-token-ring", false);
        // game.settings.set(CONSTANTS.MODULE_ID, "frame-tint", false);
        break;
      }
      case "dynamicring": {
        await game.settings.set(constants.MODULE_ID, "add-frame-default", false);
        await game.settings.set(constants.MODULE_ID, "default-color-layer", false);
        await game.settings.set(constants.MODULE_ID, "add-mask-default", true);
        await game.settings.set(constants.MODULE_ID, "enable-default-texture-layer", false);
        await game.settings.set(constants.MODULE_ID, "default-token-offset", -65);
        await game.settings.set(constants.MODULE_ID, "token-size", game.settings.settings.get(`${constants.MODULE_ID}.token-size`).default);
        await game.settings.set(constants.MODULE_ID, "auto-apply-dynamic-token-ring", true);
        // game.settings.set(CONSTANTS.MODULE_ID, "frame-tint", false);
        break;
      }
      case "nothing": {
        await game.settings.set(constants.MODULE_ID, "add-frame-default", false);
        await game.settings.set(constants.MODULE_ID, "default-color-layer", false);
        await game.settings.set(constants.MODULE_ID, "add-mask-default", false);
        await game.settings.set(constants.MODULE_ID, "enable-default-texture-layer", false);
        await game.settings.set(constants.MODULE_ID, "frame-tint", false);
        await game.settings.set(constants.MODULE_ID, "default-token-offset", 0);
        await game.settings.set(constants.MODULE_ID, "auto-apply-dynamic-token-ring", false);
        break;
      }
      // no default
    }
    foundry.utils.debounce(window.location.reload(), 100);
  }
}

function registerSettings() {

  game.settings.register(constants.MODULE_ID, "custom-frames", {
    scope: "client",
    config: false,
    type: Array,
    default: [],
  });

  game.settings.register(constants.MODULE_ID, "custom-masks", {
    scope: "client",
    config: false,
    type: Array,
    default: [],
  });

  // dialogues 
  game.settings.registerMenu(constants.MODULE_ID, "quick-settings", {
    name: `${constants.MODULE_ID}.quick-settings.label`,
    hint: `${constants.MODULE_ID}.quick-settings.description`,
    label: `${constants.MODULE_ID}.quick-settings.label`,
    scope: "client",
    config: true,
    type: QuickSettings,
  });

  game.settings.registerMenu(constants.MODULE_ID, "reset-custom-masks", {
    name: `${constants.MODULE_ID}.reset-custom-masks.name`,
    hint: `${constants.MODULE_ID}.reset-custom-masks.hint`,
    label: `${constants.MODULE_ID}.reset-custom-masks.name`,
    scope: "client",
    config: true,
    type: ResetCustomMasks,
  });

  game.settings.registerMenu(constants.MODULE_ID, "reset-custom-frames", {
    name: `${constants.MODULE_ID}.reset-custom-frames.name`,
    hint: `${constants.MODULE_ID}.reset-custom-frames.hint`,
    label: `${constants.MODULE_ID}.reset-custom-frames.name`,
    scope: "client",
    config: true,
    type: ResetCustomFrames,
  });

  // results upload
  game.settings.register(constants.MODULE_ID, "image-upload-directory", {
    name: `${constants.MODULE_ID}.image-upload-directory.name`,
    hint: `${constants.MODULE_ID}.image-upload-directory.hint`,
    scope: "world",
    config: true,
    type: String,
    filePicker: "folder",
    default: "[data] tokenizer/pc-images",
  });

  game.settings.register(constants.MODULE_ID, "npc-image-upload-directory", {
    name: `${constants.MODULE_ID}.npc-image-upload-directory.name`,
    hint: `${constants.MODULE_ID}.npc-image-upload-directory.hint`,
    scope: "world",
    config: true,
    type: String,
    filePicker: "folder",
    default: "[data] tokenizer/npc-images",
  });


  // some common token settings
  game.settings.register(constants.MODULE_ID, "image-save-type", {
    name: `${constants.MODULE_ID}.image-save-type.name`,
    hint: `${constants.MODULE_ID}.image-save-type.hint`,
    scope: "world",
    config: true,
    default: "webp",
    choices: { webp: "*.webp", png: "*.png" },
    type: String,
  });

  game.settings.register(constants.MODULE_ID, "token-size", {
    name: `${constants.MODULE_ID}.token-size.name`,
    hint: `${constants.MODULE_ID}.token-size.hint`,
    scope: "player",
    config: true,
    type: Number,
    default: 400,
  });

  game.settings.register(constants.MODULE_ID, "portrait-size", {
    name: `${constants.MODULE_ID}.portrait-size.name`,
    hint: `${constants.MODULE_ID}.portrait-size.hint`,
    scope: "player",
    config: true,
    type: Number,
    default: 1000,
  });

  game.settings.register(constants.MODULE_ID, "reset-scaling", {
    name: `${constants.MODULE_ID}.reset-scaling.name`,
    hint: `${constants.MODULE_ID}.reset-scaling.hint`,
    scope: "player",
    config: true,
    type: Boolean,
    default: false,
  });

  // frames

  game.settings.register(constants.MODULE_ID, "add-frame-default", {
    name: `${constants.MODULE_ID}.add-frame-default.name`,
    hint: `${constants.MODULE_ID}.add-frame-default.hint`,
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
  });

  game.settings.register(constants.MODULE_ID, "default-frame-pc", {
    name: `${constants.MODULE_ID}.default-frame-pc.name`,
    hint: `${constants.MODULE_ID}.default-frame-pc.hint`,
    type: libs_ImagePicker.Img,
    default: `[data] ${constants.PATH}img/default-frame-pc.png`,
    scope: "world",
    config: true,
  });

  game.settings.register(constants.MODULE_ID, "default-frame-npc", {
    name: `${constants.MODULE_ID}.default-frame-npc.name`,
    hint: `${constants.MODULE_ID}.default-frame-npc.hint`,
    type: libs_ImagePicker.Img,
    default: `[data] ${constants.PATH}img/default-frame-npc.png`,
    scope: "world",
    config: true,
  });

  game.settings.register(constants.MODULE_ID, "default-frame-neutral", {
    name: `${constants.MODULE_ID}.default-frame-neutral.name`,
    hint: `${constants.MODULE_ID}.default-frame-neutral.hint`,
    type: libs_ImagePicker.Img,
    default: `[data] ${constants.PATH}img/default-frame-npc.png`,
    scope: "world",
    config: true,
  });

  game.settings.register(constants.MODULE_ID, "frame-directory", {
    name: `${constants.MODULE_ID}.frame-directory.name`,
    hint: `${constants.MODULE_ID}.frame-directory.hint`,
    scope: "world",
    config: true,
    type: String,
    filePicker: "folder",
    default: "[data] tokenizer/frames",
  });

  game.settings.register(constants.MODULE_ID, "frame-tint", {
    name: `${constants.MODULE_ID}.frame-tint.name`,
    hint: `${constants.MODULE_ID}.frame-tint.hint`,
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
  });

  game.settings.register(constants.MODULE_ID, "default-frame-tint", {
    name: `${constants.MODULE_ID}.default-frame-tint.name`,
    hint: `${constants.MODULE_ID}.default-frame-tint.hint`,
    type: libs_ImagePicker.Img,
    default: `[data] ${constants.PATH}img/plain-marble-frame-grey.png`,
    scope: "world",
    config: true,
  });

  game.settings.register(constants.MODULE_ID, "default-frame-tint-pc", {
    name: `${constants.MODULE_ID}.default-frame-tint.pc`,
    scope: "player",
    config: true,
    type: String,
    default: "grey",
  });

  game.settings.register(constants.MODULE_ID, "default-frame-tint-friendly", {
    name: `${constants.MODULE_ID}.default-frame-tint.friendly`,
    scope: "player",
    config: true,
    type: String,
    default: "green",
  });

  game.settings.register(constants.MODULE_ID, "default-frame-tint-neutral", {
    name: `${constants.MODULE_ID}.default-frame-tint.neutral`,
    scope: "player",
    config: true,
    type: String,
    default: "blue",
  });

  game.settings.register(constants.MODULE_ID, "default-frame-tint-hostile", {
    name: `${constants.MODULE_ID}.default-frame-tint.hostile`,
    scope: "player",
    config: true,
    type: String,
    default: "red",
  });

  game.settings.register(constants.MODULE_ID, "auto-apply-dynamic-token-ring", {
    name: `${constants.MODULE_ID}.auto-apply-dynamic-token-ring.name`,
    hint: `${constants.MODULE_ID}.auto-apply-dynamic-token-ring.hint`,
    scope: "player",
    config: true,
    type: Boolean,
    default: false,
  });

  game.settings.register(constants.MODULE_ID, "force-disable-dynamic-token-ring", {
    name: `${constants.MODULE_ID}.force-disable-dynamic-token-ring.name`,
    hint: `${constants.MODULE_ID}.force-disable-dynamic-token-ring.hint`,
    scope: "player",
    config: true,
    type: Boolean,
    default: false,
  });

  game.settings.register(constants.MODULE_ID, "disable-omfg-frames", {
    name: `${constants.MODULE_ID}.disable-omfg-frames.name`,
    scope: "player",
    config: true,
    type: Boolean,
    default: false,
  });

  game.settings.register(constants.MODULE_ID, "disable-jcolson-frames", {
    name: `${constants.MODULE_ID}.disable-jcolson-frames.name`,
    scope: "player",
    config: true,
    type: Boolean,
    default: false,
  });

  game.settings.register(constants.MODULE_ID, "disable-thegreatnacho-frames", {
    name: `${constants.MODULE_ID}.disable-thegreatnacho-frames.name`,
    scope: "player",
    config: true,
    type: Boolean,
    default: false,
  });

  // colour layer
  game.settings.register(constants.MODULE_ID, "default-color-layer", {
    name: `${constants.MODULE_ID}.default-color-layer.name`,
    scope: "player",
    config: true,
    type: Boolean,
    default: true,
  });


  game.settings.register(constants.MODULE_ID, "default-color", {
    name: `${constants.MODULE_ID}.default-color.name`,
    hint: `${constants.MODULE_ID}.default-color.hint`,
    scope: "player",
    config: true,
    type: String,
    default: "white",
  });

  // Texture Layer

  game.settings.register(constants.MODULE_ID, "enable-default-texture-layer", {
    name: `${constants.MODULE_ID}.enable-default-texture-layer.name`,
    hint: `${constants.MODULE_ID}.enable-default-texture-layer.hint`,
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
  });

  game.settings.register(constants.MODULE_ID, "default-texture-layer", {
    name: `${constants.MODULE_ID}.default-texture-layer.name`,
    scope: "world",
    config: true,
    type: libs_ImagePicker.Img,
    default: `[data] ${constants.PATH}img/grey-texture.webp`,
  });

  game.settings.register(constants.MODULE_ID, "default-texture-layer-tint", {
    name: `${constants.MODULE_ID}.default-texture-layer-tint.name`,
    hint: `${constants.MODULE_ID}.default-texture-layer-tint.hint`,
    scope: "player",
    config: true,
    type: String,
    default: "",
  });

  // MASKS
  game.settings.register(constants.MODULE_ID, "add-mask-default", {
    name: `${constants.MODULE_ID}.add-mask-default.name`,
    hint: `${constants.MODULE_ID}.add-mask-default.hint`,
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
  });

  game.settings.register(constants.MODULE_ID, "masks-directory", {
    name: `${constants.MODULE_ID}.masks-directory.name`,
    hint: `${constants.MODULE_ID}.masks-directory.hint`,
    scope: "world",
    config: true,
    type: String,
    filePicker: "folder",
    default: "[data] tokenizer/masks",
  });

  game.settings.register(constants.MODULE_ID, "default-mask-layer", {
    name: `${constants.MODULE_ID}.default-mask-layer.name`,
    scope: "world",
    config: true,
    type: libs_ImagePicker.Img,
    default: `[data] ${constants.PATH}img/dynamic-ring-circle-mask.webp`,
  });

  // MISC

  game.settings.register(constants.MODULE_ID, "title-link", {
    name: `${constants.MODULE_ID}.title-link.name`,
    hint: `${constants.MODULE_ID}.title-link.hint`,
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
  });

  game.settings.register(constants.MODULE_ID, "disable-player", {
    name: `${constants.MODULE_ID}.disable-player.name`,
    hint: `${constants.MODULE_ID}.disable-player.hint`,
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
  });


  game.settings.register(constants.MODULE_ID, "disable-avatar-click", {
    name: `${constants.MODULE_ID}.disable-avatar-click.name`,
    hint: `${constants.MODULE_ID}.disable-avatar-click.hint`,
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
  });

  game.settings.register(constants.MODULE_ID, "disable-avatar-click-user", {
    name: `${constants.MODULE_ID}.disable-avatar-click-user.name`,
    hint: `${constants.MODULE_ID}.disable-avatar-click-user.hint`,
    scope: "player",
    config: true,
    type: String,
    choices: {
      global: "Use global setting",
      tokenizer: "Tokenizer",
      default: "Default File Picker",
    },
    default: "global",
  });

  game.settings.register(constants.MODULE_ID, "proxy", {
    scope: "world",
    config: false,
    type: String,
    default: "https://images.ddb.mrprimate.co.uk/",
  });

  game.settings.register(constants.MODULE_ID, "force-proxy", {
    scope: "world",
    config: false,
    type: Boolean,
    default: false,
  });

  game.settings.register(constants.MODULE_ID, "paste-target", {
    scope: "player",
    config: false,
    type: String,
    default: "token",
  });

  game.settings.register(constants.MODULE_ID, "token-only-toggle", {
    name: `${constants.MODULE_ID}.token-only-toggle.name`,
    hint: `${constants.MODULE_ID}.token-only-toggle.hint`,
    scope: "player",
    config: true,
    type: Boolean,
    default: true,
  });

  game.settings.register(constants.MODULE_ID, "default-token-offset", {
    name: `${constants.MODULE_ID}.default-token-offset.name`,
    hint: `${constants.MODULE_ID}.default-token-offset.hint`,
    scope: "player",
    config: true,
    default: -35,
    type: Number,
  });

  game.settings.register(constants.MODULE_ID, "default-algorithm", {
    name: `${constants.MODULE_ID}.default-algorithm.name`,
    scope: "player",
    config: true,
    type: Boolean,
    default: true,
  });

  game.settings.register(constants.MODULE_ID, "default-crop-image", {
    name: `${constants.MODULE_ID}.default-crop-image.name`,
    hint: `${constants.MODULE_ID}.default-crop-image.hint`,
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
  });

  game.settings.register(constants.MODULE_ID, "log-level", {
    name: `${constants.MODULE_ID}.log-level.name`,
    scope: "world",
    config: true,
    type: String,
    choices: {
      DEBUG: "DEBUG",
      INFO: "INFO",
      WARN: "WARN",
      ERR: "ERROR ",
      OFF: "OFF",
    },
    default: "INFO",
  });

  game.settings.register(constants.MODULE_ID, "actor-id-in-name", {
    name: `${constants.MODULE_ID}.actor-id-in-name.name`,
    hint: `${constants.MODULE_ID}.actor-id-in-name.hint`,
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
  });

  game.settings.register(constants.MODULE_ID, "check-for-wildcard-asterisk", {
    name: `${constants.MODULE_ID}.check-for-wildcard-asterisk.name`,
    hint: `${constants.MODULE_ID}.check-for-wildcard-asterisk.hint`,
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
  });

  libs_logger.debug("Init complete");
}

;// CONCATENATED MODULE: ./src/hooks.js









function init() {
  registerSettings();
}

function getAvatarKey() {
  let dataEditField;
  switch (game.system.id) {
    case "yzecoriolis": {
      if (foundry.utils.isNewerVersion("3.2.0", game.system.version)) {
        dataEditField = "system.keyArt";
      } else {
        dataEditField = "img";
      }
      break;
    }
    default:
      dataEditField = "img";
  }
  return dataEditField;
}

function getAvatarPath(actor) {
  const key = getAvatarKey();
  return foundry.utils.getProperty(actor, key);
}

/**
 * Launch the tokenizer
 * Options include
 * name: name to use as part of filename identifier
 * type: pc, npc - defaults to pc
 * avatarFilename: current avatar image - defaults to null/mystery man
 * tokenFilename: current tokenImage - defaults to null/mystery man
 * isWildCard: is wildcard token?
 * any other items needed in callback function, options will be passed to callback, with filenames updated to new references
 * @param {*} options 
 * @param {*} callback function to pass return object to 
 */
function launchTokenizer(options, callback) {
  if (!game.user.can("FILES_UPLOAD")) {
    ui.notifications.warn(game.i18n.localize(`${constants.MODULE_ID}.requires-upload-permission`));
    if (game.settings.get(constants.MODULE_ID, "disable-player")) return;
  }

  game.canvas.layers.forEach((layer) => {
    layer._copy = [];
  });

  libs_logger.debug("Tokenizer options", options);
  const tokenizer = new Tokenizer(options, callback);
  tokenizer.render(true);

}

function updateDynamicRingData(updateTokenData, path) {
  const setRing = game.settings.get(constants.MODULE_ID, "auto-apply-dynamic-token-ring")
    || foundry.utils.getProperty(updateTokenData, "ring.enabled");


  if (game.settings.get(constants.MODULE_ID, "force-disable-dynamic-token-ring")) {
    foundry.utils.setProperty(updateTokenData, "ring.enabled", false);
  } else {
    foundry.utils.setProperty(updateTokenData, "ring.enabled", setRing);
    if (setRing) {
      foundry.utils.setProperty(updateTokenData, "ring.subject.texture", path); 
    }
    if (setRing && game.settings.get(constants.MODULE_ID, "reset-scaling")) {
      foundry.utils.setProperty(updateTokenData, "ring.subject.scale", 1); 
    }
  }

}


function adjustScaling(tokenData) {
  if (game.settings.get(constants.MODULE_ID, "reset-scaling") && tokenData.texture) {
    // if the user has set the scaling to be reset, we do that
    tokenData.texture.scaleX = 1;
    tokenData.texture.scaleY = 1;
    tokenData.texture.offsetY = 0;
    tokenData.texture.offsetY = 0;
    tokenData.texture.rotation = 0;
    tokenData.texture.anchorX = 0.5;
    tokenData.texture.anchorY = 0.5;
    tokenData.texture.fit = "contain";
  }
}

async function updateActor(tokenizerResponse) {
  libs_logger.debug("Updating Actor, tokenizer data", tokenizerResponse);
  const dateTag = `${+new Date()}`;

  // updating the avatar filename
  const update = {};
  const avatarKey = getAvatarKey();
  update[avatarKey] = tokenizerResponse.avatarFilename.split("?")[0] + "?" + dateTag;

  if (!tokenizerResponse.isWildCard) {
    // for non-wildcard tokens, we set the token img now
    const tokenPath = tokenizerResponse.tokenFilename.split("?")[0] + "?" + dateTag;
    foundry.utils.setProperty(update, "prototypeToken.texture.src", tokenPath);
    foundry.utils.setProperty(update, "prototypeToken.randomImg", false);
    updateDynamicRingData(update.prototypeToken, tokenPath);
    adjustScaling(update.prototypeToken);
  } 
  // else if (tokenizerResponse.actor.prototypeToken.texture.src.indexOf("*") === -1) {
  //   // if it is a wildcard and it isn't set like one, we change that
  //   const actorName = tokenizerResponse.actor.name.replace(/[^\w.]/gi, "_").replace(/__+/g, "");
  //   const options = DirectoryPicker.parse(tokenizerResponse.tokenUploadDirectory);

  //   // set it to a wildcard we can actually use
  //   const imageFormat = game.settings.get(CONSTANTS.MODULE_ID, "image-save-type");
  //   const message = game.i18n.format("vtta-tokenizer.notification.wildcard", { path: tokenizerResponse.actor.prototypeToken.texture.src });
  //   ui.notifications.info(message);
  //   update.token = {
  //     img: `${options.current}/${actorName}.Token-*.${imageFormat}`,
  //   };
  // }

  libs_logger.debug("Updating with", update);
  await tokenizerResponse.actor.update(update);
  if (!update.prototypeToken) return;
  // if there is a scene token, lets update it
  if (tokenizerResponse.token) {
    tokenizerResponse.token.update(update.prototypeToken);
  } else if (canvas.ready) {
    const tokens = tokenizerResponse.actor.getActiveTokens(true);
    const tokenUpdates = tokens.map((t) => {
      const data = foundry.utils.deepClone(update.prototypeToken);
      data._id = t.id;
      return data;
    });
    await canvas.scene.updateEmbeddedDocuments("Token", tokenUpdates, { diff: false, recursive: false });
  }
}

function getActorType(actor) {
  if (["character", "pc"].includes(actor.type)) {
    // forbidden lands support
    if (foundry.utils.getProperty(actor, "system.subtype.type") === "npc") {
      return "npc";
    } else {
      return "pc";
    }
  } else {
    return "npc";
  }
  
}

function getWildCard(actor) {
  const isWildCard = actor.prototypeToken.randomImg;
  if (!isWildCard) return false;

  const asterisk = game.settings.get(constants.MODULE_ID, "check-for-wildcard-asterisk");
  if (!asterisk) return isWildCard;

  return actor.prototypeToken.texture.src.includes("*");
}

function tokenizeActor(actor) {
  const addId = game.settings.get(constants.MODULE_ID, "actor-id-in-name");
  const options = {
    actor: actor,
    name: actor.name,
    type: getActorType(actor),
    disposition: actor.prototypeToken.disposition,
    avatarFilename: getAvatarPath(actor),
    tokenFilename: actor.prototypeToken.texture.src,
    isWildCard: getWildCard(actor),
    nameSuffix: addId ? `.${actor._id}` : undefined,
  };

  launchTokenizer(options, updateActor);

}

function tokenizeSceneToken(doc) {
  const options = {
    actor: doc.actor,
    token: doc.token,
    name: doc.token.name,
    type: getActorType(doc.actor),
    disposition: doc.token.disposition,
    avatarFilename: getAvatarPath(doc.actor),
    tokenFilename: doc.token.texture.src,
    nameSuffix: `.${doc.token._id}`,
  };

  launchTokenizer(options, updateActor);

}

function tokenizeSceneTokenV2(doc) {
  const options = {
    actor: doc,
    token: doc.token,
    name: doc.token.name,
    type: getActorType(doc),
    disposition: doc.token.disposition,
    avatarFilename: getAvatarPath(doc),
    tokenFilename: doc.token.texture.src,
    nameSuffix: `.${doc.token._id}`,
  };

  launchTokenizer(options, updateActor);

}


function tokenizeDoc(doc) {
  if (doc.token) {
    tokenizeSceneToken(doc);
  } else {  
    tokenizeActor(doc);
  }
}

function tokenizeDocV2() {
  // eslint-disable-next-line no-invalid-this
  const doc = this.document;

  if (doc.token) {
    // eslint-disable-next-line no-invalid-this
    tokenizeSceneTokenV2(this.actor);
  } else {
    tokenizeActor(doc);
  }
}

async function updateSceneTokenImg(actor) {
  const updates = await Promise.all(actor.getActiveTokens().map(async (t) => {
    const newToken = await actor.getTokenDocument();
    const tokenUpdate = {
      _id: t.id,
      "texture": newToken.texture,
      "ring": newToken.ring,
    };
    return tokenUpdate;
  }));
  if (updates.length) canvas.scene.updateEmbeddedDocuments("Token", updates);
}

async function autoToken(actor, options) {
  const defaultOptions = {
    actor: actor,
    name: actor.name,
    type: getActorType(actor),
    disposition: actor.prototypeToken.disposition,
    avatarFilename: getAvatarPath(actor),
    tokenFilename: actor.prototypeToken.texture.src,
    isWildCard: getWildCard(actor),
    auto: true,
    updateActor: true,
  };
  const mergedOptions = foundry.utils.mergeObject(defaultOptions, options);
  const tokenizer = new Tokenizer(mergedOptions, updateActor);

  // create mock elements to generate images in
  const tokenizerHtml = `<div class="token" id="tokenizer-token-parent"><h1>${game.i18n.localize("vtta-tokenizer.label.token")}</h1><div class="view" id="tokenizer-token"></div>`;
  let doc = Utils.htmlToDoc(tokenizerHtml);
  let tokenView = doc.querySelector(".token > .view");
  
  // get the target filename for the token
  const nameSuffix = tokenizer.tokenOptions.nameSuffix ? tokenizer.tokenOptions.nameSuffix : "";
  const targetFilename = await tokenizer._getFilename("Token", nameSuffix);
  tokenizer.tokenFileName = targetFilename;

  // create a Token View
  tokenizer.Token = new View(tokenizer, game.settings.get(constants.MODULE_ID, "token-size"), tokenView);
  // Add the actor image and frame to the token view
  await tokenizer._initToken(tokenizer.tokenOptions.tokenFilename);
  // upload result to foundry
  const dataResult = await tokenizer.Token.get("blob");
  await tokenizer.updateToken(dataResult);
  // update actor
  if (mergedOptions.updateActor) {
    await updateActor(tokenizer.tokenOptions);
  }
  return tokenizer.tokenOptions.tokenFilename;
}

function fixUploadLocation() {
  // Set base character upload folder.
  const characterUploads = game.settings.get(constants.MODULE_ID, "image-upload-directory");
  const npcUploads = game.settings.get(constants.MODULE_ID, "npc-image-upload-directory");
  const frameUploads = game.settings.get(constants.MODULE_ID, "frame-directory");
  const maskUploads = game.settings.get(constants.MODULE_ID, "masks-directory");

  if (game.user.isGM) {
    libs_DirectoryPicker.verifyPath(libs_DirectoryPicker.parse(characterUploads));
    libs_DirectoryPicker.verifyPath(libs_DirectoryPicker.parse(npcUploads));
    libs_DirectoryPicker.verifyPath(libs_DirectoryPicker.parse(frameUploads));
    libs_DirectoryPicker.verifyPath(libs_DirectoryPicker.parse(maskUploads));
  }

  if (characterUploads != "" && npcUploads == "") game.settings.set(constants.MODULE_ID, "npc-image-upload-directory", characterUploads);

}


function getActorSheetHeaderButtons(app, buttons) {
  if (
    // don't enable if user can't upload
    !game.user.can("FILES_UPLOAD")
    // and the player setting is disabled
    && game.settings.get(constants.MODULE_ID, "disable-player")
  ) {
    return;
  }

  const titleLink = game.settings.get(constants.MODULE_ID, "title-link");
  if (!titleLink) return;
  const doc = (app.token) ? app : app.document;

  buttons.unshift({
    label: "Tokenizer",
    icon: "far fa-user-circle",
    class: constants.MODULE_ID,
    onclick: () => tokenizeDoc(doc),
  });
}

function getActorSheetHeaderButtonsV2(config, buttons) {
  if (!(config.document instanceof Actor)) return;
  if (
    // don't enable if user can't upload
    !game.user.can("FILES_UPLOAD")
    // and the player setting is disabled
    && game.settings.get(constants.MODULE_ID, "disable-player")
  ) {
    return;
  }

  config.options.actions["tokenizer"] = tokenizeDocV2;
  buttons.push({
    label: "Tokenizer",
    icon: "far fa-user-circle",
    action: "tokenizer",
  });
}

function linkTidySheets() {
  const api = game.modules.get('tidy5e-sheet')?.api;
  if (!api) return;

  api.config.actorPortrait.registerMenuCommands([
    {
      label: game.i18n.localize("vtta-tokenizer.module-name"),
      iconClass: "fas fa-user-circle",
      tooltip: game.i18n.localize("vtta-tokenizer.label.open"),
      enabled: (params) => params.actor.type !== "vehicle",
      execute: (params) => {
        const token = foundry.utils.getProperty(params, "context.options.token");
        const doc = token
          ? { actor: params.actor, token }
          : params.actor;
        libs_logger.debug("Calling Tokenizer via Tidy5e sheet", { params, token, doc });
        tokenizeDoc(doc);
      },
    },
  ]);
}

function linkDefaultSheets() {
  let sheetNames = Object.values(CONFIG.Actor.sheetClasses)
    .reduce((arr, classes) => {
      return arr.concat(Object.values(classes).map((c) => c.cls));
    }, [])
    .map((cls) => cls.name);

  // register tokenizer on all character (npc and pc) sheets
  sheetNames.forEach((sheetName) => {
    Hooks.on("render" + sheetName, (app, html, data) => {
      if (game.user) {
        const doc = (app.token) ? app : app.document;
        const disableAvatarClickGlobal = game.settings.get(constants.MODULE_ID, "disable-avatar-click");
        const disableAvatarClickUser = game.settings.get(constants.MODULE_ID, "disable-avatar-click-user");
        const disableAvatarClick = disableAvatarClickUser === "global"
          ? disableAvatarClickGlobal
          : disableAvatarClickUser === "default";
        const dataEditField = getAvatarKey();

        $(html)
        .find(`[data-edit="${dataEditField}"], [data-edit="prototypeToken.texture.src"]`)
        .each((index, element) => {
          // deactivating the original FilePicker click
          $(element).off("click");

          // replace it with Tokenizer OR FilePicker click
          $(element).on("click", (event) => {

            const launchTokenizer
              = (!disableAvatarClick && !event.shiftKey) // avatar click not disabled, and not shift key
              || (disableAvatarClick && event.shiftKey); // avatar click disabled, and shift key

            if (launchTokenizer) {
              event.stopPropagation();
              tokenizeDoc(doc);
              event.preventDefault();
            } else {
              // showing the filepicker
              const current = data.actor ? data.actor[dataEditField] : data[dataEditField];
              const FPClass = foundry?.applications?.apps?.FilePicker?.implementation ?? FilePicker;
              new FPClass({
                type: "image",
                current,
                callback: (path) => {
                  event.currentTarget.src = path;
                  app._onSubmit(event);
                },
                top: app.position.top + 40,
                left: app.position.left + 10,
              }).browse();
            }
          });
        });
        
      }
    });
  });
}

function linkSheets() {
  if (
    // don't enable if user can't upload
    !game.user.can("FILES_UPLOAD")
    // and the player setting is disabled
    && game.settings.get(constants.MODULE_ID, "disable-player")
  ) {
    return;
  }

  linkTidySheets();
  linkDefaultSheets();
}

function exposeAPI() {
  const API = {
    launch: launchTokenizer,
    launchTokenizer,
    tokenizeActor,
    tokenizeSceneToken,
    tokenizeDoc,
    updateSceneTokenImg,
    autoToken,
  };

  window.Tokenizer = API;
  game.modules.get(constants.MODULE_ID).api = API;
}

function addCompendiumContextOptions(contextOptions) {
  if (!game.user.isGM) return;
  contextOptions.push({
    name: `${constants.MODULE_ID}.compendium.auto-tokenize`,
    callback: (li) => {
      const pack = $(li).attr("data-pack");
      const compendium = game.packs.get(pack);
      if (compendium) {
        const auto = new AutoTokenize(compendium);
        auto.render(true);
      }
    },
    condition: (li) => {
      const pack = $(li).attr("data-pack");
      const compendium = game.packs.get(pack);
      if (!compendium) return false;
      const isActor = compendium.metadata.type === "Actor";
      return isActor;
    },
    icon: '<i class="fas fa-user-circle"></i>',
  });
}

function addUpdateSceneTokensContext(contextOptions) {
  if (!game.user.isGM) return;

  contextOptions.push({
    name: `${constants.MODULE_ID}.apply-prototype-to-scene`,
    callback: (li) => {
      const docId = $(li).attr("data-entry-id")
        ?? $(li).attr("data-document-id")
        ?? $(li).attr("data-actor-id")
        ?? $(li).attr("data-entity-id");
      if (docId) {
        const doc = game.actors.get(docId);
        libs_logger.debug(`Updating ${doc.name} scene tokens for:`, doc);
        updateSceneTokenImg(doc);
      }
    },
    icon: '<i class="fas fa-user-circle"></i>',
    condition: () => {
      return game.user.can("FILES_UPLOAD");
    },
  });
}

function addTokenizerContentOption(contextOptions) {
  if (
    // don't enable if user can't upload
    !game.user.can("FILES_UPLOAD")
    // and the player setting is disabled
    && game.settings.get(constants.MODULE_ID, "disable-player")
  ) {
    return;
  }

  contextOptions.push({
    name: "Tokenizer",
    callback: (li) => {
      const docId = $(li).attr("data-entry-id")
        ?? $(li).attr("data-document-id")
        ?? $(li).attr("data-actor-id")
        ?? $(li).attr("data-entity-id");
      if (docId) {
        const doc = game.actors.get(docId);
        libs_logger.debug(`Tokenizing ${doc.name}`);
        tokenizeActor(doc);
      }
    },
    icon: '<i class="fas fa-user-circle"></i>',
    condition: () => {
      return game.user.can("FILES_UPLOAD")
        || !game.settings.get(constants.MODULE_ID, "disable-player");
    },
  });
}

function ready() {
  libs_logger.info("Ready Hook Called");
  fixUploadLocation();
  linkSheets();
  exposeAPI();
}

Hooks.on('getActorDirectoryEntryContext', (html, contextOptions) => {
  addTokenizerContentOption(contextOptions);
  addUpdateSceneTokensContext(contextOptions);
});

Hooks.on("getCompendiumDirectoryEntryContext", (html, contextOptions) => {
  addCompendiumContextOptions(contextOptions);
});

Hooks.on('getActorSheetHeaderButtons', getActorSheetHeaderButtons);
Hooks.on("getHeaderControlsApplicationV2", getActorSheetHeaderButtonsV2);

// v13 hooks for context menus
Hooks.once('getActorContextOptions', (html, contextOptions) => {
  addTokenizerContentOption(contextOptions);
  addUpdateSceneTokensContext(contextOptions);
});

Hooks.once("getCompendiumContextOptions", (html, contextOptions) => {
  addCompendiumContextOptions(contextOptions);
});

;// CONCATENATED MODULE: ./src/index.js


// registering the hooks
Hooks.on("init", init);
Hooks.once("ready", ready);

/******/ })()
;
//# sourceMappingURL=main.js.map