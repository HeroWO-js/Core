define(function (require, exports, module) {"use strict";
function _array_like_to_array(arr, len) {
    if (len == null || len > arr.length) len = arr.length;
    for(var i = 0, arr2 = new Array(len); i < len; i++)arr2[i] = arr[i];
    return arr2;
}
function _array_with_holes(arr) {
    if (Array.isArray(arr)) return arr;
}
function asyncGeneratorStep(gen, resolve, reject, _next, _throw, key, arg) {
    try {
        var info = gen[key](arg);
        var value = info.value;
    } catch (error) {
        reject(error);
        return;
    }
    if (info.done) {
        resolve(value);
    } else {
        Promise.resolve(value).then(_next, _throw);
    }
}
function _async_to_generator(fn) {
    return function() {
        var self = this, args = arguments;
        return new Promise(function(resolve, reject) {
            var gen = fn.apply(self, args);
            function _next(value) {
                asyncGeneratorStep(gen, resolve, reject, _next, _throw, "next", value);
            }
            function _throw(err) {
                asyncGeneratorStep(gen, resolve, reject, _next, _throw, "throw", err);
            }
            _next(undefined);
        });
    };
}
function _class_call_check(instance, Constructor) {
    if (!(instance instanceof Constructor)) {
        throw new TypeError("Cannot call a class as a function");
    }
}
function _defineProperties(target, props) {
    for(var i = 0; i < props.length; i++){
        var descriptor = props[i];
        descriptor.enumerable = descriptor.enumerable || false;
        descriptor.configurable = true;
        if ("value" in descriptor) descriptor.writable = true;
        Object.defineProperty(target, descriptor.key, descriptor);
    }
}
function _create_class(Constructor, protoProps, staticProps) {
    if (protoProps) _defineProperties(Constructor.prototype, protoProps);
    if (staticProps) _defineProperties(Constructor, staticProps);
    return Constructor;
}
function _iterable_to_array_limit(arr, i) {
    var _i = arr == null ? null : typeof Symbol !== "undefined" && arr[Symbol.iterator] || arr["@@iterator"];
    if (_i == null) return;
    var _arr = [];
    var _n = true;
    var _d = false;
    var _s, _e;
    try {
        for(_i = _i.call(arr); !(_n = (_s = _i.next()).done); _n = true){
            _arr.push(_s.value);
            if (i && _arr.length === i) break;
        }
    } catch (err) {
        _d = true;
        _e = err;
    } finally{
        try {
            if (!_n && _i["return"] != null) _i["return"]();
        } finally{
            if (_d) throw _e;
        }
    }
    return _arr;
}
function _non_iterable_rest() {
    throw new TypeError("Invalid attempt to destructure non-iterable instance.\\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
}
function _sliced_to_array(arr, i) {
    return _array_with_holes(arr) || _iterable_to_array_limit(arr, i) || _unsupported_iterable_to_array(arr, i) || _non_iterable_rest();
}
function _unsupported_iterable_to_array(o, minLen) {
    if (!o) return;
    if (typeof o === "string") return _array_like_to_array(o, minLen);
    var n = Object.prototype.toString.call(o).slice(8, -1);
    if (n === "Object" && o.constructor) n = o.constructor.name;
    if (n === "Map" || n === "Set") return Array.from(n);
    if (n === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)) return _array_like_to_array(o, minLen);
}
function _ts_generator(thisArg, body) {
    var f, y, t, g, _ = {
        label: 0,
        sent: function() {
            if (t[0] & 1) throw t[1];
            return t[1];
        },
        trys: [],
        ops: []
    };
    return(g = {
        next: verb(0),
        "throw": verb(1),
        "return": verb(2)
    }, typeof Symbol === "function" && (g[Symbol.iterator] = function() {
        return this;
    }), g);
    function verb(n) {
        return function(v) {
            return step([
                n,
                v
            ]);
        };
    }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while(_)try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [
                op[0] & 2,
                t.value
            ];
            switch(op[0]){
                case 0:
                case 1:
                    t = op;
                    break;
                case 4:
                    _.label++;
                    return {
                        value: op[1],
                        done: false
                    };
                case 5:
                    _.label++;
                    y = op[1];
                    op = [
                        0
                    ];
                    continue;
                case 7:
                    op = _.ops.pop();
                    _.trys.pop();
                    continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) {
                        _ = 0;
                        continue;
                    }
                    if (op[0] === 3 && (!t || op[1] > t[0] && op[1] < t[3])) {
                        _.label = op[1];
                        break;
                    }
                    if (op[0] === 6 && _.label < t[1]) {
                        _.label = t[1];
                        t = op;
                        break;
                    }
                    if (t && _.label < t[2]) {
                        _.label = t[2];
                        _.ops.push(op);
                        break;
                    }
                    if (t[2]) _.ops.pop();
                    _.trys.pop();
                    continue;
            }
            op = body.call(thisArg, _);
        } catch (e) {
            op = [
                6,
                e
            ];
            y = 0;
        } finally{
            f = t = 0;
        }
        if (op[0] & 5) throw op[1];
        return {
            value: op[0] ? op[1] : void 0,
            done: true
        };
    }
}
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = function(target, all) {
    for(var name in all)__defProp(target, name, {
        get: all[name],
        enumerable: true
    });
};
var __copyProps = function(to, from, except, desc) {
    if (from && typeof from === "object" || typeof from === "function") {
        var _iteratorNormalCompletion = true, _didIteratorError = false, _iteratorError = undefined;
        try {
            var _loop = function() {
                var key = _step.value;
                if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
                    get: function() {
                        return from[key];
                    },
                    enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
                });
            };
            for(var _iterator = __getOwnPropNames(from)[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true)_loop();
        } catch (err) {
            _didIteratorError = true;
            _iteratorError = err;
        } finally{
            try {
                if (!_iteratorNormalCompletion && _iterator.return != null) {
                    _iterator.return();
                }
            } finally{
                if (_didIteratorError) {
                    throw _iteratorError;
                }
            }
        }
    }
    return to;
};
var __toCommonJS = function(mod) {
    return __copyProps(__defProp({}, "__esModule", {
        value: true
    }), mod);
};
// src/CanvasMapRenderer.ts
var CanvasMapRenderer_exports = {};
__export(CanvasMapRenderer_exports, {
    CanvasMapRenderer: function() {
        return CanvasMapRenderer;
    }
});
module.exports = __toCommonJS(CanvasMapRenderer_exports);
// src/renderer/ImageRenderer.ts
var ImageRenderer = /*#__PURE__*/ function() {
    function ImageRenderer(canvasRenderingContext2D, map, imageLoader) {
        _class_call_check(this, ImageRenderer);
        this.canvasRenderingContext2D = canvasRenderingContext2D;
        this.map = map;
        this.imageLoader = imageLoader;
    }
    _create_class(ImageRenderer, [
        {
            key: "render",
            value: function render(x, y, param) {
                var imageX = param.imageX, imageY = param.imageY, imageUrl = param.imageUrl, offsetX = param.offsetX, offsetY = param.offsetY, mirrorX = param.mirrorX, mirrorY = param.mirrorY;
                if (!imageUrl) {
                    return;
                }
                var image = this.imageLoader.getImage(imageUrl);
                if (!image) {
                    return;
                }
                this.canvasRenderingContext2D.save();
                var tileSize = this.map.constants.tileSize;
                if (mirrorX || mirrorY) {
                    this.canvasRenderingContext2D.scale(mirrorX ? -1 : 1, mirrorY ? -1 : 1);
                    var translateX = mirrorX ? -(2 * x + 1) * tileSize : 0;
                    var translateY = mirrorY ? -(2 * y + 1) * tileSize : 0;
                    this.canvasRenderingContext2D.translate(translateX, translateY);
                }
                var imageOffsetX = mirrorX ? imageX + offsetX : imageX - offsetX;
                var imageOffsetY = mirrorY ? imageY + offsetY : imageY - offsetY;
                this.canvasRenderingContext2D.drawImage(image, imageOffsetX * tileSize, imageOffsetY * tileSize, tileSize, tileSize, x * tileSize, y * tileSize, tileSize, tileSize);
                this.canvasRenderingContext2D.restore();
            }
        }
    ]);
    return ImageRenderer;
}();
// src/renderer/FogRenderer.ts
var FogRenderer = /*#__PURE__*/ function() {
    function FogRenderer(map, canvasRenderingContext2D) {
        _class_call_check(this, FogRenderer);
        this.map = map;
        this.canvasRenderingContext2D = canvasRenderingContext2D;
    }
    _create_class(FogRenderer, [
        {
            key: "renderWithFogEffect",
            value: function renderWithFogEffect(x, y, renderFn) {
                renderFn();
                var tileSize = this.map.constants.tileSize;
                this.canvasRenderingContext2D.fillStyle = "rgba(0, 0, 0, 0.5)";
                this.canvasRenderingContext2D.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
                this.canvasRenderingContext2D.fillStyle = "none";
            }
        }
    ]);
    return FogRenderer;
}();
// src/renderer/TileRenderer.ts
var TileRenderer = /*#__PURE__*/ function() {
    function TileRenderer(canvasRenderingContext2D, map, imageLoader) {
        _class_call_check(this, TileRenderer);
        this.canvasRenderingContext2D = canvasRenderingContext2D;
        this.map = map;
        this.imageLoader = imageLoader;
        this.fogRenderer = new FogRenderer(this.map, this.canvasRenderingContext2D);
        this.imageRenderer = new ImageRenderer(this.canvasRenderingContext2D, this.map, this.imageLoader);
    }
    _create_class(TileRenderer, [
        {
            key: "render",
            value: function render(x, y, parameters) {
                var _this = this;
                if (parameters.shroud && !parameters.partialShroud) {
                    this.imageRenderer.render(x, y, parameters.shroud);
                    return;
                }
                if (parameters.fog) {
                    this.fogRenderer.renderWithFogEffect(x, y, function() {
                        _this.renderObjects(x, y, parameters);
                    });
                } else {
                    this.renderObjects(x, y, parameters);
                }
            }
        },
        {
            key: "renderObjects",
            value: function renderObjects(x, y, parameters) {
                for(var i = 0; i < parameters.objectLayers.length; i++){
                    this.imageRenderer.render(x, y, parameters.objectLayers[i]);
                }
                if (parameters.shroud && parameters.partialShroud) {
                    this.imageRenderer.render(x, y, parameters.shroud);
                }
            }
        }
    ]);
    return TileRenderer;
}();
// src/CanvasState.ts
var CanvasState = /*#__PURE__*/ function() {
    function CanvasState(map) {
        _class_call_check(this, CanvasState);
        this.height = map.get("height");
        this.state = Array(map.get("width") * this.height);
    }
    _create_class(CanvasState, [
        {
            key: "get",
            value: function get(x, y) {
                return this.state[y + x * this.height];
            }
        },
        {
            key: "set",
            value: function set(x, y, value) {
                this.state[y + x * this.height] = value;
            }
        }
    ]);
    return CanvasState;
}();
// src/CanvasLayerRenderer.ts
var CanvasLayerRenderer = /*#__PURE__*/ function() {
    function CanvasLayerRenderer(canvas, rangeHelper, mapper, objectManager, imageLoader, pl, map, z) {
        _class_call_check(this, CanvasLayerRenderer);
        this.canvas = canvas;
        this.rangeHelper = rangeHelper;
        this.mapper = mapper;
        this.objectManager = objectManager;
        this.imageLoader = imageLoader;
        this.pl = pl;
        this.map = map;
        this.z = z;
        this.updateScheduled = false;
        this.state = new CanvasState(this.map);
        this.context = this.canvas.getContext("2d");
        this.tileRenderer = new TileRenderer(this.context, this.map, this.imageLoader);
        this.mapper = mapper;
        this.map = map;
        this.z = z;
        this.rangeHelper = rangeHelper;
        this.height = map.get("height");
        this.dirtyStateArray = Array(map.get("width") * this.height);
    }
    _create_class(CanvasLayerRenderer, [
        {
            key: "fillMap",
            value: function fillMap() {
                var _this = this;
                this.rangeHelper.forMap(function(x, y) {
                    _this.updateTile(x, y);
                });
            }
        },
        {
            key: "renderMap",
            value: function renderMap() {
                var _this = this;
                this.rangeHelper.forMap(function(x, y) {
                    _this.tileRenderer.render(x, y, _this.state.get(x, y));
                });
            }
        },
        {
            key: "getH3State",
            value: function getH3State(x, y) {
                var isTileVisible = this.isTileVisible(x, y);
                return {
                    objects: this.objectManager.getObjectsAtPosition(x, y, this.z),
                    visible: isTileVisible
                };
            }
        },
        {
            key: "isTileVisible",
            value: function isTileVisible(x, y) {
                return this.map.shroud.atCoords(x + 1, y + 1, this.z, this.pl.get("player")) >= 0;
            }
        },
        {
            key: "setDirty",
            value: function setDirty(x, y) {
                this.dirtyStateArray[this.getIndex(x, y)] = true;
                this.scheduleUpdate();
            }
        },
        {
            key: "setUpdated",
            value: function setUpdated(x, y) {
                this.dirtyStateArray[this.getIndex(x, y)] = false;
            }
        },
        {
            key: "setRangeDirty",
            value: function setRangeDirty(x, y, endX, endY) {
                var _this = this;
                this.rangeHelper.forRange(x, y, endX, endY, function(tileX, tileY) {
                    return _this.setDirty(tileX, tileY);
                });
            }
        },
        {
            key: "setObjectDirty",
            value: function setObjectDirty(object) {
                this.setRangeDirty(object.x, object.y, object.x + object.width, object.y + object.height);
            }
        },
        {
            key: "isDirty",
            value: function isDirty(x, y) {
                return this.dirtyStateArray[this.getIndex(x, y)];
            }
        },
        {
            key: "updateTile",
            value: function updateTile(x, y) {
                var state = this.mapper.toCanvas(x, y, this.z, this.getH3State(x, y));
                this.state.set(x, y, state);
                this.setUpdated(x, y);
            }
        },
        {
            key: "updateAndRenderTile",
            value: function updateAndRenderTile(x, y) {
                this.updateTile(x, y);
                this.tileRenderer.render(x, y, this.state.get(x, y));
            }
        },
        {
            key: "animateTile",
            value: function animateTile(x, y) {
                var state = this.state.get(x, y);
                if ((!state || !state.animation) && !this.isDirty(x, y)) {
                    return;
                }
                this.updateTile(x, y);
                this.tileRenderer.render(x, y, this.state.get(x, y));
            }
        },
        {
            key: "forceUpdateRange",
            value: function forceUpdateRange(x, y, endX, endY) {
                var _this = this;
                this.rangeHelper.forRange(x, y, endX, endY, function(tileX, tileY) {
                    return _this.updateAndRenderTile(tileX, tileY);
                });
            }
        },
        {
            key: "scheduleUpdate",
            value: function scheduleUpdate() {
                var _this = this;
                if (!this.updateScheduled) {
                    this.updateScheduled = true;
                    queueMicrotask(function() {
                        return _this.updateDirtyTiles();
                    });
                }
            }
        },
        {
            key: "getIndex",
            value: function getIndex(x, y) {
                return y + x * this.height;
            }
        },
        {
            key: "updateDirtyTiles",
            value: function updateDirtyTiles() {
                var _this = this;
                this.updateScheduled = false;
                this.rangeHelper.forMap(function(x, y) {
                    var dirty = _this.isDirty(x, y);
                    if (dirty) {
                        _this.updateAndRenderTile(x, y);
                    }
                });
            }
        }
    ]);
    return CanvasLayerRenderer;
}();
// src/H3ToCanvasTileStateMapper.ts
var H3ToCanvasTileStateMapper = /*#__PURE__*/ function() {
    function H3ToCanvasTileStateMapper(map, cx, pl, sc, rules, appState, imageLoader, _) {
        _class_call_check(this, H3ToCanvasTileStateMapper);
        this.map = map;
        this.cx = cx;
        this.pl = pl;
        this.sc = sc;
        this.rules = rules;
        this.appState = appState;
        this.imageLoader = imageLoader;
        this._ = _;
    }
    _create_class(H3ToCanvasTileStateMapper, [
        {
            key: "getVisibility",
            value: function getVisibility(x, y, z) {
                return this.map.shroud.atCoords(x + 1, y + 1, z, this.pl.get("player"));
            }
        },
        {
            key: "getTileShroudState",
            value: function getTileShroudState(x, y, z) {
                var visibility = this.getVisibility(x, y, z);
                if (!this.sc.get("mapShroud")) {
                    return {
                        visible: true
                    };
                }
                var classic = this.cx.get("classic");
                if (visibility >= 0) {
                    return {
                        visible: true,
                        fog: !classic && !this.map.constants.shroud.visible.includes(visibility)
                    };
                }
                var edge = this.map.constants.shroud.edge;
                var key = this.map.constants.shroud.edgeKey;
                var frameSeed = edge[+(this.getVisibility(x, y - 1, z) >= 0) << key.t | +(this.getVisibility(x, y + 1, z) >= 0) << key.b | +(this.getVisibility(x - 1, y, z) >= 0) << key.l | +(this.getVisibility(x - 1, y - 1, z) >= 0) << key.tl | +(this.getVisibility(x - 1, y + 1, z) >= 0) << key.bl | +(this.getVisibility(x + 1, y, z) >= 0) << key.r | +(this.getVisibility(x + 1, y - 1, z) >= 0) << key.tr | +(this.getVisibility(x + 1, y + 1, z) >= 0) << key.br | x & 1 << key.oddX | y & 1 << key.oddY];
                if (!frameSeed && frameSeed !== 0) {
                    if (classic) {
                        var repeat = this.map.constants.shroud.repeat;
                        frameSeed = x ? repeat[y % 4][(x - 1) % 3] : y % 4;
                        return {
                            visible: false,
                            mirrorX: false,
                            frameSeed: frameSeed,
                            type: "c"
                        };
                    }
                    var n = x + y * this.map.get("width");
                    var repeatRandom = this.map.get("random") * 2147483648 | 0;
                    var rules = this.cx.modules.nested("HeroWO.H3.Rules");
                    var repeatFrames = rules.animations.atCoords(rules.animationsID.TSHRC_0, 0, 0, "frameCount", 0);
                    frameSeed = this._.randomBySeed(repeatRandom ^ (n << 4 | z))[1] * repeatFrames | 0;
                    return {
                        visible: false,
                        mirrorX: false,
                        frameSeed: frameSeed,
                        type: "c"
                    };
                }
                var mirrorX = false;
                if (frameSeed < 0) {
                    mirrorX = true;
                    frameSeed = ~frameSeed;
                }
                return {
                    visible: false,
                    partial: true,
                    mirrorX: mirrorX,
                    type: "e",
                    frameSeed: frameSeed,
                    fog: !classic
                };
            }
        },
        {
            key: "getShroudImage",
            value: function getShroudImage(x, y, z, param) {
                var mirrorX = param.mirrorX, frameSeed = param.frameSeed, type = param.type;
                if (!type) {
                    return null;
                }
                var imageUrl = "../DEF-PNG/Tshr".concat(type, "/0-").concat(frameSeed, ".png");
                if (!this.imageLoader.isImageLoaded(imageUrl)) {
                    this.imageLoader.addUrlForLoad(imageUrl, {
                        x: x,
                        y: y,
                        z: z
                    });
                }
                return {
                    imageUrl: imageUrl,
                    height: 1,
                    width: 1,
                    offsetX: 0,
                    offsetY: 0,
                    mirrorX: mirrorX !== null && mirrorX !== void 0 ? mirrorX : false,
                    mirrorY: false,
                    imageX: 0,
                    imageY: 0
                };
            }
        },
        {
            key: "getObjectImage",
            value: function getObjectImage(tileX, tileY, z, object) {
                var texture = object.texture, id = object.id, mirrorX = object.mirrorX, mirrorY = object.mirrorY, width = object.width, height = object.height, x = object.x, y = object.y, animation = object.animation, duration = object.duration;
                if (!texture) {
                    return null;
                }
                var globalFrameIndex = this.appState.globalAnimationTick || 1;
                var _ref = this.appState.objectOptions.get(id) || {}, _ref_frameIndex = _ref.frameIndex, frameIndex = _ref_frameIndex === void 0 ? 0 : _ref_frameIndex, offsetX = _ref.offsetX, offsetY = _ref.offsetY;
                var _texture_split = _sliced_to_array(texture.split(","), 7), objectTextureFolder = _texture_split[1], ownerName = _texture_split[3], textureType = _texture_split[4], animationStep = _texture_split[6];
                var hasMovingAnimation = offsetX || offsetY;
                var imageUrl;
                if (animation) {
                    var animationType = hasMovingAnimation ? this._getMovingDirectionAnimationIndex(offsetX, offsetY) || textureType : textureType;
                    var animationFramesCount = (duration || 0) / 180;
                    var animationFrame = frameIndex || globalFrameIndex % animationFramesCount || 0;
                    imageUrl = "../DEF-PNG/".concat(objectTextureFolder, "/").concat(ownerName).concat(animationType, "-").concat(animationFrame, ".png");
                    this.imageLoader.addAnimationUrlsForPreload(imageUrl, objectTextureFolder, ownerName, textureType, animationFramesCount);
                } else {
                    imageUrl = "../DEF-PNG/".concat(objectTextureFolder, "/").concat(ownerName).concat(textureType, "-").concat(animationStep, ".png");
                }
                if (!this.imageLoader.isImageLoaded(imageUrl)) {
                    this.imageLoader.addUrlForLoad(imageUrl, {
                        x: tileX,
                        y: tileY,
                        z: z
                    });
                }
                var tileOffsetX = hasMovingAnimation && frameIndex ? offsetX * frameIndex / 8 : 0;
                var tileOffsetY = hasMovingAnimation && frameIndex ? offsetY * frameIndex / 8 : 0;
                var imageX = mirrorX ? x + width - tileX - 2 : tileX - x + 1;
                var imageY = mirrorY ? y + height - tileY - 2 : tileY - y + 1;
                return {
                    imageUrl: imageUrl,
                    imageX: imageX,
                    imageY: imageY,
                    offsetX: tileOffsetX,
                    offsetY: tileOffsetY,
                    width: width,
                    height: height,
                    mirrorX: mirrorX,
                    mirrorY: mirrorY
                };
            }
        },
        {
            key: "_getMovingDirectionAnimationIndex",
            value: function _getMovingDirectionAnimationIndex(offsetX, offsetY) {
                if (offsetX === 1 && offsetY === 0) {
                    return this.rules.constants.animation.group.moveRight;
                }
                if (offsetX === 1 && offsetY === 1) {
                    return this.rules.constants.animation.group.moveDownRight;
                }
                if (offsetX === 1 && offsetY === -1) {
                    return this.rules.constants.animation.group.moveUpRight;
                }
                if (offsetX === 0 && offsetY === 1) {
                    return this.rules.constants.animation.group.moveDown;
                }
                if (offsetX === 0 && offsetY === -1) {
                    return this.rules.constants.animation.group.moveUp;
                }
                if (offsetX === -1 && offsetY === 0) {
                    return this.rules.constants.animation.group.moveRight;
                }
                if (offsetX === -1 && offsetY === 1) {
                    return this.rules.constants.animation.group.moveDownRight;
                }
                if (offsetX === -1 && offsetY === -1) {
                    return this.rules.constants.animation.group.moveUpRight;
                }
                return null;
            }
        },
        {
            key: "toCanvas",
            value: function toCanvas(x, y, z, param) {
                var objects = param.objects, visible = param.visible;
                var _this = this;
                var hasAnimation = objects.some(function(object) {
                    return !!object.animation && !!object.duration;
                });
                var shroud = this.getTileShroudState(x, y, z);
                var _shroud_partial, _shroud_fog;
                return {
                    animation: hasAnimation,
                    partialShroud: (_shroud_partial = shroud.partial) !== null && _shroud_partial !== void 0 ? _shroud_partial : false,
                    shroud: this.getShroudImage(x, y, z, shroud),
                    fog: (_shroud_fog = shroud.fog) !== null && _shroud_fog !== void 0 ? _shroud_fog : false,
                    objectLayers: objects.map(function(obj) {
                        return _this.getObjectImage(x, y, z, obj);
                    }).filter(function(v) {
                        return !!v;
                    })
                };
            }
        }
    ]);
    return H3ToCanvasTileStateMapper;
}();
// src/AppState.ts
var AppState = function AppState(map) {
    _class_call_check(this, AppState);
    this.globalAnimationTick = 0;
    this.objectOptions = /* @__PURE__ */ new Map();
    this.tileSize = map.constants.tileSize;
};
// src/ImageLoader.ts
var ImageLoader = /*#__PURE__*/ function() {
    function ImageLoader() {
        _class_call_check(this, ImageLoader);
        this._imageCache = /* @__PURE__ */ new Map();
        this._newImageUrls = /* @__PURE__ */ new Map();
        this._onImagesLoadedCb = null;
        this._loadScheduled = false;
        this._asyncLoadingEnabled = false;
    }
    _create_class(ImageLoader, [
        {
            key: "_loadImage",
            value: function _loadImage(url) {
                return _async_to_generator(function() {
                    return _ts_generator(this, function(_state) {
                        return [
                            2,
                            new Promise(function(resolve, reject) {
                                var image = new Image();
                                image.src = url;
                                var onError;
                                var onLoad = function() {
                                    resolve(image);
                                    image.removeEventListener("load", onLoad);
                                    image.removeEventListener("error", onError);
                                };
                                onError = function() {
                                    reject();
                                    image.removeEventListener("load", onLoad);
                                    image.removeEventListener("error", onError);
                                };
                                image.addEventListener("load", onLoad);
                                image.addEventListener("error", onError);
                            })
                        ];
                    });
                })();
            }
        },
        {
            key: "loadAllImages",
            value: function loadAllImages() {
                var _this = this;
                return _async_to_generator(function() {
                    var urls, loadRequests, promise;
                    return _ts_generator(this, function(_state) {
                        switch(_state.label){
                            case 0:
                                urls = Array.from(_this._newImageUrls.keys());
                                loadRequests = urls.map(function(url) {
                                    return _this._loadImage(url).then(function(image) {
                                        _this._imageCache.set(url, image);
                                    }).catch(function() {
                                        console.error("Failed to load ".concat(url));
                                    });
                                });
                                return [
                                    4,
                                    Promise.all(loadRequests)
                                ];
                            case 1:
                                promise = _state.sent();
                                if (_this._asyncLoadingEnabled) {
                                    _this._notifyImagesLoaded(Array.from(_this._newImageUrls.values()).flat());
                                }
                                _this._newImageUrls.clear();
                                _this._asyncLoadingEnabled = true;
                                _this._loadScheduled = false;
                                return [
                                    2,
                                    promise
                                ];
                        }
                    });
                })();
            }
        },
        {
            key: "hasUnloadedImages",
            value: function hasUnloadedImages() {
                return this._newImageUrls.size > 0;
            }
        },
        {
            key: "addUrlForLoad",
            value: function addUrlForLoad(url, point) {
                var _this = this;
                if (this.isImageLoaded(url)) {
                    return;
                }
                var _this__newImageUrls_get;
                var points = (_this__newImageUrls_get = this._newImageUrls.get(url)) !== null && _this__newImageUrls_get !== void 0 ? _this__newImageUrls_get : [];
                if (point) {
                    points.push(point);
                }
                this._newImageUrls.set(url, points);
                if (!this._loadScheduled && this._asyncLoadingEnabled) {
                    this._loadScheduled = true;
                    queueMicrotask(function() {
                        return _this.loadAllImages();
                    });
                }
            }
        },
        {
            key: "isImageLoaded",
            value: function isImageLoaded(url) {
                return this._imageCache.has(url);
            }
        },
        {
            key: "_notifyImagesLoaded",
            value: function _notifyImagesLoaded(points) {
                var _this__onImagesLoadedCb, _this;
                (_this__onImagesLoadedCb = (_this = this)._onImagesLoadedCb) === null || _this__onImagesLoadedCb === void 0 ? void 0 : _this__onImagesLoadedCb.call(_this, points);
            }
        },
        {
            key: "onImagesLoaded",
            value: function onImagesLoaded(cb) {
                this._onImagesLoadedCb = cb;
            }
        },
        {
            key: "addAnimationUrlsForPreload",
            value: function addAnimationUrlsForPreload(currentUrl, objectTextureFolder, ownerName, textureType, animationFramesCount) {
                if (this._imageCache.has(currentUrl) || this._newImageUrls.has(currentUrl)) {
                    return;
                }
                for(var i = 0; i < animationFramesCount; i++){
                    var url = "../DEF-PNG/".concat(objectTextureFolder, "/").concat(ownerName || "").concat(textureType, "-").concat(i, ".png");
                    this._newImageUrls.set(url, []);
                }
            }
        },
        {
            key: "getImage",
            value: function getImage(url) {
                return this._imageCache.get(url);
            }
        }
    ]);
    return ImageLoader;
}();
// src/ObjectManager.ts
var objectKeys = [
    "x",
    "y",
    "z",
    "height",
    "width",
    "id",
    "animation",
    "displayOrder",
    "duration",
    "texture",
    "passable",
    "mirrorX",
    "mirrorY"
];
function H3ObjectComparator(a, b) {
    if (a.passable && b.passable) {
        var tilesOfABlockedByB = 0;
        var tilesOfBBlockedByA = 0;
        var intersectionRect = {
            x: Math.max(a.x, b.x),
            y: Math.max(a.y, b.y),
            endX: Math.min(a.x + a.width, b.x + b.width),
            endY: Math.min(a.y + a.height, b.y + b.height)
        };
        var diffXA = intersectionRect.x - a.x;
        var diffXB = intersectionRect.x - b.x;
        var diffYA = intersectionRect.y - a.y;
        var diffYB = intersectionRect.y - b.y;
        for(var i = 0; i < intersectionRect.endX - intersectionRect.x; i++){
            for(var j = 0; j < intersectionRect.endY - intersectionRect.y; j++){
                var passableA = a.passable[i + diffXA + (j + diffYA) * a.width];
                var passableABelow = a.passable[i + diffXA + (j + diffYA + 1) * a.width];
                var passableB = b.passable[i + diffXB + (j + diffYB) * b.width];
                var passableBBelow = b.passable[i + diffXB + (j + diffYB + 1) * b.width];
                if (passableA === "0" && passableBBelow === "0") {
                    tilesOfABlockedByB++;
                }
                if (passableABelow === "0" && passableB === "0") {
                    tilesOfBBlockedByA++;
                }
            }
        }
        if (tilesOfABlockedByB !== tilesOfBBlockedByA) {
            return tilesOfBBlockedByA - tilesOfABlockedByB;
        }
    }
    return a.displayOrder - b.displayOrder;
}
var ObjectManager = /*#__PURE__*/ function() {
    function ObjectManager(map) {
        _class_call_check(this, ObjectManager);
        this._insertedObjects = /* @__PURE__ */ new Map();
        this._hiddenObjects = /* @__PURE__ */ new Set();
        this.map = map;
        this.objectsAtter = this.map.objects.atter(objectKeys);
    }
    _create_class(ObjectManager, [
        {
            key: "getObjectsAtPosition",
            value: function getObjectsAtPosition(x, y, z) {
                var _this = this;
                var objects = [];
                this._insertedObjects.forEach(function(value) {
                    if (value.z === z && x >= value.x && x <= value.endX && y >= value.y && y <= value.endY) {
                        objects.push(value.object);
                    }
                });
                this.map.bySpot.findAtCoords(x + 1, y + 1, z, 0, function(id) {
                    var obj = _this.objectsAtter(id, 0, 0, 0);
                    if (!_this._hiddenObjects.has(obj.id)) {
                        objects.push(obj);
                    }
                });
                return objects.sort(H3ObjectComparator);
            }
        },
        {
            key: "insertObjectAt",
            value: function insertObjectAt(obj, x, y, z, endX, endY) {
                this._insertedObjects.set(obj.id, {
                    x: x,
                    y: y,
                    z: z,
                    endX: endX,
                    endY: endY,
                    object: obj
                });
            }
        },
        {
            key: "removeInsertedObject",
            value: function removeInsertedObject(objectId) {
                this._insertedObjects.delete(objectId);
            }
        },
        {
            key: "hideRealObject",
            value: function hideRealObject(objectId) {
                this._hiddenObjects.add(objectId);
            }
        },
        {
            key: "restoreRealObject",
            value: function restoreRealObject(objectId) {
                this._hiddenObjects.delete(objectId);
            }
        }
    ]);
    return ObjectManager;
}();
// src/CanvasRangeHelper.ts
var CanvasRangeHelper = /*#__PURE__*/ function() {
    function CanvasRangeHelper(map, cx, sc, pl) {
        _class_call_check(this, CanvasRangeHelper);
        this._parallelBlockSize = 8;
        this._mergedRegionsMap = /* @__PURE__ */ new Map();
        this._scheduled = false;
        this.map = map;
        this.cx = cx;
        this.sc = sc;
        this.pl = pl;
        this._mapWidth = map.get("width");
        this._tileSize = map.constants.tileSize;
    }
    _create_class(CanvasRangeHelper, [
        {
            key: "forRange",
            value: function forRange(x, y, endX, endY, fn) {
                for(var i = x; i < endX; i++){
                    for(var j = y; j < endY; j++){
                        fn(i, j);
                    }
                }
            }
        },
        {
            key: "forRangeMerged",
            value: function forRangeMerged(x, y, endX, endY, fn) {
                for(var i = x; i < endX; i++){
                    for(var j = y; j < endY; j++){
                        var yMap = void 0;
                        if (this._mergedRegionsMap.has(i)) {
                            yMap = this._mergedRegionsMap.get(i);
                        } else {
                            yMap = /* @__PURE__ */ new Map();
                            this._mergedRegionsMap.set(i, yMap);
                        }
                        yMap.set(j, fn);
                    }
                }
                this._scheduleMergedRegionFnExecution();
            }
        },
        {
            key: "_scheduleMergedRegionFnExecution",
            value: function _scheduleMergedRegionFnExecution() {
                var _this = this;
                if (!this._scheduled) {
                    queueMicrotask(function() {
                        return _this._executeMergedRegionsFn();
                    });
                    this._scheduled = true;
                }
            }
        },
        {
            key: "_executeMergedRegionsFn",
            value: function _executeMergedRegionsFn() {
                this._scheduled = false;
                this._mergedRegionsMap.forEach(function(yMap, x) {
                    yMap.forEach(function(fn, y) {
                        fn(x, y);
                    });
                });
                this._mergedRegionsMap.clear();
            }
        },
        {
            key: "forRangeNonBlocking",
            value: function forRangeNonBlocking(x, y, endX, endY, fn) {
                var _this = this, _loop = function(i) {
                    var _loop = function(j) {
                        setTimeout(function() {
                            for(var i1 = i; i1 < i + _this1._parallelBlockSize && i1 < endX; i1++){
                                for(var j1 = j; j1 < j + _this1._parallelBlockSize && j1 < endY; j1++){
                                    fn(i1, j1);
                                }
                            }
                        });
                    };
                    for(var j = y; j < endY; j += _this._parallelBlockSize)_loop(j);
                };
                var _this1 = this;
                for(var i = x; i < endX; i += this._parallelBlockSize)_loop(i);
            }
        },
        {
            key: "forMap",
            value: function forMap(fn) {
                this.forRange(0, 0, this._mapWidth, this.map.get("height"), fn);
            }
        },
        {
            key: "forMapNonBlocking",
            value: function forMapNonBlocking(fn) {
                this.forRangeNonBlocking(0, 0, this._mapWidth, this.map.get("height"), fn);
            }
        },
        {
            key: "forViewport",
            value: function forViewport(fn) {
                var nonBlocking = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : false;
                var _this_sc_get = _sliced_to_array(this.sc.get("mapPosition"), 2), viewCenterX = _this_sc_get[0], viewCenterY = _this_sc_get[1];
                var _this_sc_get1 = _sliced_to_array(this.sc.get("mapViewSize"), 2), viewWidth = _this_sc_get1[0], viewHeight = _this_sc_get1[1];
                var width = this.map.get("width");
                var height = this.map.get("height");
                var margin = this.map.get("margin");
                var viewX = viewCenterX - 1 - viewWidth / 2;
                var viewY = viewCenterY - 1 - viewHeight / 2;
                var safeViewX = viewX < margin[0] ? margin[0] : viewX;
                var safeViewY = viewY < margin[1] ? margin[1] : viewY;
                var safeViewEndX = viewX + viewWidth > width - margin[2] ? width - margin[2] : viewX + viewWidth;
                var safeViewEndY = viewY + viewHeight > height - margin[3] ? height - margin[3] : viewY + viewHeight;
                if (nonBlocking) {
                    this.forRangeNonBlocking(safeViewX, safeViewY, safeViewEndX, safeViewEndY, fn);
                } else {
                    this.forRange(safeViewX, safeViewY, safeViewEndX, safeViewEndY, fn);
                }
            }
        }
    ]);
    return CanvasRangeHelper;
}();
// src/AnimationManager.ts
function animate(steps, stepInterval, callback) {
    var MIN_INTERVAL = 1e3 / 90;
    var shouldSkipSteps = stepInterval < MIN_INTERVAL;
    return new Promise(function() {
        var _ref = _async_to_generator(function(resolve) {
            var i, result, animateInRaf, interval;
            return _ts_generator(this, function(_state) {
                switch(_state.label){
                    case 0:
                        if (steps <= 0) {
                            resolve();
                            return [
                                2
                            ];
                        }
                        i = 0;
                        return [
                            4,
                            callback(i)
                        ];
                    case 1:
                        result = _state.sent();
                        i++;
                        if (steps === 1 || result === false) {
                            resolve();
                            return [
                                2
                            ];
                        }
                        if (shouldSkipSteps) {
                            animateInRaf = function() {
                                return requestAnimationFrame(/*#__PURE__*/ _async_to_generator(function() {
                                    return _ts_generator(this, function(_state) {
                                        switch(_state.label){
                                            case 0:
                                                return [
                                                    4,
                                                    callback(i)
                                                ];
                                            case 1:
                                                result = _state.sent();
                                                i += 3;
                                                if (i < steps && result !== false) {
                                                    animateInRaf();
                                                } else {
                                                    resolve();
                                                }
                                                return [
                                                    2
                                                ];
                                        }
                                    });
                                }));
                            };
                            animateInRaf();
                            return [
                                2
                            ];
                        }
                        interval = setInterval(/*#__PURE__*/ _async_to_generator(function() {
                            return _ts_generator(this, function(_state) {
                                switch(_state.label){
                                    case 0:
                                        return [
                                            4,
                                            callback(i)
                                        ];
                                    case 1:
                                        result = _state.sent();
                                        i++;
                                        if (i >= steps || result === false) {
                                            clearInterval(interval);
                                            resolve();
                                            return [
                                                2
                                            ];
                                        }
                                        return [
                                            2
                                        ];
                                }
                            });
                        }), stepInterval);
                        return [
                            2
                        ];
                }
            });
        });
        return function(resolve) {
            return _ref.apply(this, arguments);
        };
    }());
}
var AnimationManager = /*#__PURE__*/ function() {
    function AnimationManager() {
        _class_call_check(this, AnimationManager);
        this._globalTickIndex = 0;
        this._actions = [];
    }
    _create_class(AnimationManager, [
        {
            key: "setInterval",
            value: function setInterval1(tick) {
                var _this = this;
                if (this._interval) {
                    clearInterval(this._interval);
                }
                this._interval = setInterval(function() {
                    _this._globalTickIndex++;
                    if (_this._globalTickIndex > 1e8) {
                        _this._globalTickIndex = 1;
                    }
                    _this._actions.forEach(function(action) {
                        return action(_this._globalTickIndex);
                    });
                }, tick);
            }
        },
        {
            key: "onTick",
            value: function onTick(action) {
                this._actions.push(action);
            }
        },
        {
            key: "getTick",
            value: function getTick() {
                return this._globalTickIndex;
            }
        },
        {
            key: "destroy",
            value: function destroy() {
                this.stop();
            }
        },
        {
            key: "stop",
            value: function stop() {
                if (this._interval) {
                    clearInterval(this._interval);
                }
            }
        }
    ]);
    return AnimationManager;
}();
// src/CanvasMapRenderer.ts
var CanvasMapRenderer = /*#__PURE__*/ function() {
    function CanvasMapRenderer(parentElement, rules, map, sc, cx, pl, _) {
        _class_call_check(this, CanvasMapRenderer);
        this.parentElement = parentElement;
        this.rules = rules;
        this.map = map;
        this.sc = sc;
        this.cx = cx;
        this.pl = pl;
        this._ = _;
        this.appState = new AppState(this.map);
        this.imageLoader = new ImageLoader();
        this.mapper = new H3ToCanvasTileStateMapper(this.map, this.cx, this.pl, this.sc, this.rules, this.appState, this.imageLoader, this._);
        this.objectManager = new ObjectManager(this.map);
        this.regionHelper = new CanvasRangeHelper(this.map, this.cx, this.sc, this.pl);
        this.animationManager = new AnimationManager();
        this.layers = [];
        this.activeLayerZ = 0;
        this.rendered = false;
        this.animationRunning = false;
        for(var z = 0; z < map.get("levels"); z++){
            this.layers.push(this.createLayer(z));
        }
        this.setActiveLayer(this.sc.get("z"));
        this.startAnimation();
    }
    _create_class(CanvasMapRenderer, [
        {
            key: "createLayer",
            value: function createLayer(z) {
                var canvas = document.createElement("canvas");
                var margin = this.map.get("margin");
                var width = this.map.get("width");
                var tileSize = this.map.constants.tileSize;
                var height = this.map.get("height");
                canvas.setAttribute("width", width * tileSize + "px");
                canvas.setAttribute("height", height * tileSize + "px");
                canvas.style.setProperty("position", "absolute");
                canvas.style.setProperty("left", -(margin[0] - 1) * tileSize + "px");
                canvas.style.setProperty("top", -(margin[1] - 1) * tileSize + "px");
                this.parentElement.append(canvas);
                return new CanvasLayerRenderer(canvas, this.regionHelper, this.mapper, this.objectManager, this.imageLoader, this.pl, this.map, z);
            }
        },
        {
            key: "setActiveLayer",
            value: function setActiveLayer(z) {
                this.activeLayerZ = z;
                var activeLayer = this.getActiveLayer();
                activeLayer.canvas.style.setProperty("z-index", null);
                this.layers.filter(function(layer) {
                    return layer.z !== z;
                }).forEach(function(layer) {
                    layer.canvas.style.setProperty("z-index", "-1");
                });
            }
        },
        {
            key: "getActiveLayer",
            value: function getActiveLayer() {
                return this.layers[this.activeLayerZ];
            }
        },
        {
            key: "drawObject",
            value: function drawObject(obj) {
                if (!this.rendered) {
                    return;
                }
                var x = obj.x, y = obj.y, z = obj.z, width = obj.width, height = obj.height;
                var layer = this.layers[z];
                layer.setRangeDirty(x - 1, y - 1, x + width - 1, y + height - 1);
            }
        },
        {
            key: "drawTiles",
            value: function drawTiles(x, y, endX, endY) {
                var layer = this.getActiveLayer();
                layer.setRangeDirty(x, y, endX, endY);
            }
        },
        {
            key: "drawMap",
            value: function drawMap() {
                var _this = this;
                return _async_to_generator(function() {
                    return _ts_generator(this, function(_state) {
                        switch(_state.label){
                            case 0:
                                _this.layers.forEach(function(layer) {
                                    return layer.fillMap();
                                });
                                return [
                                    4,
                                    _this.imageLoader.loadAllImages()
                                ];
                            case 1:
                                _state.sent();
                                _this.layers.forEach(function(layer) {
                                    return layer.renderMap();
                                });
                                _this.setupAsyncImageLoadingListener();
                                _this.rendered = true;
                                return [
                                    2
                                ];
                        }
                    });
                })();
            }
        },
        {
            key: "animateObjectMoving",
            value: function animateObjectMoving(from, to, z) {
                var _this = this;
                if (!from || !to) {
                    return Promise.resolve();
                }
                this.animationRunning = true;
                var layer = this.layers[z];
                var id = from.id;
                var xFrom = from.x;
                var xTo = to.x;
                var yFrom = from.y;
                var yTo = to.y;
                var width = from.width;
                var height = from.height;
                this.objectManager.removeInsertedObject(id);
                this.objectManager.insertObjectAt(Object.assign(Object.assign({}, to), {
                    x: xFrom,
                    y: yFrom
                }), Math.min(xFrom, xTo) - 1, Math.min(yFrom, yTo) - 1, z, Math.max(xFrom, xTo) + width - 1, Math.max(yFrom, yTo) + height - 1);
                var offsetX = xTo - xFrom;
                var offsetY = yTo - yFrom;
                return animate(8, 30, function(frame) {
                    var options = {
                        frameIndex: frame,
                        offsetX: offsetX,
                        offsetY: offsetY
                    };
                    _this.appState.objectOptions.set(id, options);
                    layer.forceUpdateRange(xFrom - 2, yFrom - 2, xFrom + width + 2, yFrom + height + 2);
                });
            }
        },
        {
            key: "prepareObjectForAnimation",
            value: function prepareObjectForAnimation(object) {
                this.objectManager.hideRealObject(object.id);
            }
        },
        {
            key: "finishObjectAnimation",
            value: function finishObjectAnimation(id) {
                this.objectManager.removeInsertedObject(id);
                this.appState.objectOptions.delete(id);
                this.objectManager.restoreRealObject(id);
                this.animationRunning = false;
            }
        },
        {
            key: "startAnimation",
            value: function startAnimation() {
                var _this = this;
                this.animationManager.setInterval(180);
                this.animationManager.onTick(function(i) {
                    return _this.runAnimation(i);
                });
            }
        },
        {
            key: "stopAnimation",
            value: function stopAnimation() {
                this.animationManager.stop();
            }
        },
        {
            key: "runAnimation",
            value: function runAnimation(i) {
                if (!this.rendered) {
                    return;
                }
                this.appState.globalAnimationTick = i;
                var activeLayer = this.getActiveLayer();
                this.regionHelper.forViewport(function(x, y) {
                    activeLayer.animateTile(x, y);
                });
            }
        },
        {
            key: "setupAsyncImageLoadingListener",
            value: function setupAsyncImageLoadingListener() {
                var _this = this;
                this.imageLoader.onImagesLoaded(function(regions) {
                    return _this._onImagesLoaded(regions);
                });
            }
        },
        {
            key: "_onImagesLoaded",
            value: function _onImagesLoaded(points) {
                var _this = this;
                if (!this.rendered) {
                    return;
                }
                points.forEach(function(region) {
                    var z = region.z;
                    var layer = _this.layers[z];
                    layer.setDirty(region.x, region.y);
                });
            }
        },
        {
            key: "destroy",
            value: function destroy() {
                this.animationManager.destroy();
                this.layers.forEach(function(layer) {
                    return layer.canvas.remove();
                });
            }
        }
    ]);
    return CanvasMapRenderer;
}();


});
