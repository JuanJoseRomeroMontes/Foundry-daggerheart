import * as constants from "@common/constants.mjs";
import * as handlebars from "handlebars";
import PixiJS from "pixi.js";
import * as SocketIO from "socket.io-client";
import Canvas from "./canvas/board.mjs";
import * as globalFoundry from "./client.mjs";
import * as globalConfig from "./config.mjs";
import Game from "./game.mjs";
import * as globalUI from "./ui.mjs";

declare global {
  namespace globalThis {
    export import CONFIG = globalConfig;
    export import CONST = constants;
    export import Handlebars = handlebars;
    export import PIXI = PixiJS;
    export import ProseMirror = globalFoundry.prosemirror;
    export import foundry = globalFoundry;
    export import getDocumentClass = globalFoundry.utils.getDocumentClass;
    export import io = SocketIO;
    export import ui = globalUI;

    const canvas: Canvas;
    const game: Game;
  }
}
