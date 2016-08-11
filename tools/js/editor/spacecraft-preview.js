/**
 * Copyright 2016 Krisztián Nagy
 * @file Provides the setup and event-handling for the preview window used for spacecraft classes within the Interstellar Armada editor.
 * @author Krisztián Nagy [nkrisztian89@gmail.com]
 * @licence GNU GPLv3 <http://www.gnu.org/licenses/>
 * @version 1.0
 */

/*global define, document */
/*jslint white: true, nomen: true, plusplus: true */

/**
 * @param utils Used for enum value listing, async execution.
 * @param vec Used for vector operations related to camera control.
 * @param mat Used for matrix operatinos related to camera control.
 * @param managedGL Used to create a managed context for the WebGL preview canvas.
 * @param budaScene Used for creating the preview scene and light sources.
 * @param resources Used to request media resources and wait for their loading.
 * @param graphics Used to access the graphics settings of the game (same are used for the preview)
 * @param config Used to access default camera configuration settings.
 * @param classes Used to create an object view for the preview spacecraft.
 * @param logic Used to create the preview spacecraft(s) and access the environments.
 * @param common Used to create selectors.
 */
define([
    "utils/utils",
    "utils/vectors",
    "utils/matrices",
    "modules/managed-gl",
    "modules/buda-scene",
    "modules/media-resources",
    "armada/graphics",
    "armada/configuration",
    "armada/classes",
    "armada/logic",
    "editor/common"
], function (utils, vec, mat, managedGL, budaScene, resources, graphics, config, classes, logic, common) {
    "use strict";
    var
            // ----------------------------------------------------------------------
            // Enums
            /**
             * The available render modes for the preview.
             * @enum {String}
             * @type Object
             */
            RenderMode = {
                WIREFRAME: "wireframe",
                SOLID: "solid",
                BOTH: "both"
            },
    // ----------------------------------------------------------------------
    // Constants
    INITIAL_CAMERA_FOV = 40,
            INITIAL_CAMERA_SPAN = 0.2,
            ROTATION_MOUSE_SENSITIVITY = 1.0,
            SPACECRAFT_ROTATE_BUTTON = utils.MouseButton.LEFT,
            CAMERA_ROTATE_BUTTON = utils.MouseButton.MIDDLE,
            ENLARGE_FACTOR = 1.05,
            SHRINK_FACTOR = 0.95,
            SETTING_LABEL_CLASS = "settingLabel",
            CANVAS_BACKGROUND_COLOR = [0, 0, 0, 1],
            LIGHT_SOURCES = [
                {
                    color: [1, 1, 1],
                    direction: [1, 0, 1]
                }
            ],
            WIREFRAME_SHADER_NAME = "oneColor",
            WIREFRAME_SHADER_COLOR_UNIFORM_NAME = "color",
            WIREFRAME_COLOR = [1, 1, 1, 1],
            MANAGED_CONTEXT_NAME = "context",
            DEFAULT_DISTANCE_FACTOR = 1.5,
            MAX_DISTANCE_FACTOR = 100,
            OBJECT_VIEW_NAME = "standard",
            FOV = 45,
            /**
             * The names of properties the changing of which should trigger a refresh of the preview
             * @type String[]
             */
            REFRESH_PROPERTIES = ["model", "shader", "texture", "factionColor", "defaultLuminosityFactors"],
            // ----------------------------------------------------------------------
            // Private variables
            /**
             * @type ManagedGLContext
             */
            _context,
            /**
             * @type Scene
             */
            _scene,
            /**
             * @type Spacecraft
             */
            _spacecraft, _wireframeSpacecraft,
            /**
             * @type Number[2]
             */
            _mousePos,
            /**
             * @type Boolean
             */
            _turningSpacecraft, _turningCamera,
            /**
             * A reference to the object storing the HTML elements to be used for the preview
             * @type Object
             */
            _elements,
            /**
             * A reference to the displayed spacecraft class
             * @type SpacecraftClass
             */
            _spacecraftClass,
            /**
             * (enum RenderMode)
             * @type String
             */
            _renderMode,
            /**
             * @type String
             */
            _lod,
            /**
             * @type String
             */
            _environmentName, _equipmentProfileName,
            /**
             * 
             * @type Number[4]
             */
            _factionColor,
            /**
             * 
             * @type Boolean
             */
            _factionColorChanged,
            /**
             * 
             * @type Object
             */
            _optionElements = {
                renderModeSelector: null,
                lodSelector: null,
                environmentSelector: null,
                equipmentSelector: null,
                factionColorPicker: null
            };
    // ----------------------------------------------------------------------
    // Private Functions
    /**
     * Called when a change happens as the result of which the preview scene should rendered again (if it is not rendered continuously)
     */
    function _requestRender() {
        _scene.render(_context, 0);
    }
    /**
     * Turns the spacecraft or the camera (or both), depending on which turn mode is active. Attached to the mouse move after a mouse down 
     * on the preview canvas.
     * @param {MouseEvent} event
     */
    function _handleMouseMove(event) {
        var cameraOri,
                rotA = -(event.screenX - _mousePos[0]) * Math.radians(ROTATION_MOUSE_SENSITIVITY),
                rotB = -(event.screenY - _mousePos[1]) * Math.radians(ROTATION_MOUSE_SENSITIVITY);
        if (_spacecraft) {
            if (_turningSpacecraft) {
                cameraOri = _scene.getCamera().getCameraOrientationMatrix();
                _spacecraft.getVisualModel().rotate(mat.getRowB43(cameraOri), rotA);
                _spacecraft.getVisualModel().rotate(mat.getRowA43(cameraOri), rotB);
                _wireframeSpacecraft.getVisualModel().rotate(mat.getRowB43(cameraOri), rotA);
                _wireframeSpacecraft.getVisualModel().rotate(mat.getRowA43(cameraOri), rotB);
            }
            if (_turningCamera) {
                _scene.getCamera().setAngularVelocityVector([-rotB, -rotA, 0]);
                _scene.getCamera().update(10000);
                _scene.getCamera().setAngularVelocityVector([0, 0, 0]);
            }
            _requestRender();
        }
        _mousePos = [event.screenX, event.screenY];
    }
    /**
     * A handler for the mouse up event that cancels the rotation (of the spacecraft or the camera, depending on the button) by the mouse
     * @param {MouseEvent} event
     * @returns {Boolean}
     */
    function _handleMouseUp(event) {
        switch (event.which) {
            case SPACECRAFT_ROTATE_BUTTON:
                _turningSpacecraft = false;
                break;
            case CAMERA_ROTATE_BUTTON:
                _turningCamera = false;
                break;
        }
        if (!_turningSpacecraft && !_turningCamera) {
            document.body.onmousemove = null;
            document.body.onmouseup = null;
        }
        event.preventDefault();
        event.stopPropagation();
        return false;
    }
    /**
     * A handler for the mouse down event that sets the other handlers to start mouse model /camera rotation (depending on the button)
     * @param {MouseEvent} event
     * @returns {Boolean}
     */
    function _handleMouseDown(event) {
        switch (event.which) {
            case SPACECRAFT_ROTATE_BUTTON:
                _turningSpacecraft = true;
                break;
            case CAMERA_ROTATE_BUTTON:
                _turningCamera = true;
                break;
        }
        if (_turningSpacecraft || _turningCamera) {
            _mousePos = [event.screenX, event.screenY];
            document.body.onmousemove = _handleMouseMove;
            // once the user releases the mouse button, the event handlers should be cancelled
            document.body.onmouseup = _handleMouseUp;
        }
        event.preventDefault();
        event.stopPropagation();
        return false;
    }
    /**
     * A handler for the wheel event that fires when the user scrolls with the mouse, that approaches / moves away from the spacecraft,
     * depending on the scroll direction
     * @param {WheelEvent} event
     * @returns {Boolean}
     */
    function _handleWheel(event) {
        var originalDistance, originalPos, scaleFactor = 0;
        if (event.deltaY > 0) {
            scaleFactor = ENLARGE_FACTOR;
        }
        if (event.deltaY < 1) {
            scaleFactor = SHRINK_FACTOR;
        }
        if (scaleFactor) {
            originalPos = mat.translationVector3(_scene.getCamera().getCameraPositionMatrix());
            originalDistance = vec.length3(originalPos);
            _scene.getCamera().setControlledVelocityVector([0, 0, originalDistance * (scaleFactor - 1)]);
            _scene.getCamera().update(1000);
            _scene.getCamera().setControlledVelocityVector([0, 0, 0]);
            _requestRender();
        }
        return false;
    }
    /**
     * Return whether according to the currently set render mode, the wireframe model should be rendered.
     * @returns {Boolean}
     */
    function _shouldRenderWireframe() {
        return (_renderMode === RenderMode.WIREFRAME) || (_renderMode === RenderMode.BOTH);
    }
    /**
     * Return whether according to the currently set render mode, the solid model should be rendered.
     * @returns {Boolean}
     */
    function _shouldRenderSolid() {
        return (_renderMode === RenderMode.SOLID) || (_renderMode === RenderMode.BOTH);
    }
    /**
     * Shows or hides the wireframe and solid models according to the currently set render mode. Does not call for render.
     */
    function _updateForRenderMode() {
        if (_shouldRenderWireframe()) {
            _wireframeSpacecraft.getVisualModel().getNode().show();
        } else {
            _wireframeSpacecraft.getVisualModel().getNode().hide();
        }
        if (_shouldRenderSolid()) {
            _spacecraft.getVisualModel().getNode().show();
        } else {
            _spacecraft.getVisualModel().getNode().hide();
        }
    }
    /**
     * Sets the currently active numeric LOD for the passed model
     * @param {ShadedLODMesh} model
     */
    function _updateLOD(model) {
        if (model.setStaticLOD) {
            model.setStaticLOD(graphics.getLOD(_lod));
        }
    }
    /**
     * Sets the currently active numeric LOD for the wireframe and solid models. Does not call for render.
     */
    function _updateForLOD() {
        _spacecraft.getVisualModel().getNode().execute(_updateLOD);
        _wireframeSpacecraft.getVisualModel().getNode().execute(_updateLOD);
    }
    /**
     * Creates and returns a <span> HTML element storing the passed text, having the class associated with setting labels.
     * @param {String} text
     * @returns {Element}
     */
    function _createSettingLabel(text) {
        var result = document.createElement("span");
        result.classList.add(SETTING_LABEL_CLASS);
        result.innerHTML = text;
        return result;
    }
    /**
     * @typedef {Object} refreshParams
     * @property {Boolean} preserve Whether to preserve the existing settings (e.g. spacecraft and camera orientation)
     * @property {Boolean} reload Whether to force-reload the spacecraft (even if the settings are set to be preserved)
     * @property {String} environmentName The name of the environment to put the previewed spacecraft in
     * @property {String} equipmentProfileName The name of the equipment profile to be equipped on the previewed spacecraft
     */
    /**
     * Updates the content of the preview canvas according to the current preview settings
     * @param {refreshParams} params
     */
    function _updateCanvas(params) {
        var shadowMappingSettings,
                environmentChanged,
                equipmentProfileChanged,
                shouldReload,
                orientationMatrix,
                i;
        params = params || {};
        environmentChanged = params.environmentName !== _environmentName;
        equipmentProfileChanged = params.equipmentProfileName !== _equipmentProfileName;
        shouldReload = !params.preserve || params.reload;
        if (graphics.shouldUseShadowMapping()) {
            graphics.getShadowMappingShader();
        }
        if (_spacecraft && shouldReload) {
            if (params.preserve) {
                orientationMatrix = mat.matrix4(_spacecraft.getVisualModel().getOrientationMatrix());
            }
            _spacecraft.destroy();
            _spacecraft = null;
            _wireframeSpacecraft.destroy();
            _wireframeSpacecraft = null;
        }
        if (!_scene) {
            _scene = new budaScene.Scene(
                    0, 0, 1, 1, // full canvas
                    true, [true, true, true, true], // background is erased on render
                    CANVAS_BACKGROUND_COLOR, true,
                    graphics.getLODContext(),
                    graphics.getMaxDirLights(),
                    graphics.getMaxPointLights(),
                    graphics.getMaxSpotLights(),
                    {
                        useVerticalValues: config.getSetting(config.GENERAL_SETTINGS.USE_VERTICAL_CAMERA_VALUES),
                        viewDistance: config.getSetting(config.BATTLE_SETTINGS.VIEW_DISTANCE),
                        fov: INITIAL_CAMERA_FOV,
                        span: INITIAL_CAMERA_SPAN,
                        transitionDuration: config.getSetting(config.BATTLE_SETTINGS.CAMERA_DEFAULT_TRANSITION_DURATION),
                        transitionStyle: config.getSetting(config.BATTLE_SETTINGS.CAMERA_DEFAULT_TRANSITION_STYLE)
                    });
            resources.executeWhenReady(function () {
                shadowMappingSettings = graphics.getShadowMappingSettings();
                if (shadowMappingSettings) {
                    shadowMappingSettings.deferSetup = true;
                }
                _scene.setShadowMapping(shadowMappingSettings);
            });
        } else {
            if (environmentChanged || shouldReload) {
                _scene.clearNodes();
                _scene.clearDirectionalLights();
                _scene.clearPointLights();
                _scene.clearSpotLights();
            }
        }
        // clear the previous render
        if (_context && !params.preserve) {
            _requestRender();
        }
        if ((environmentChanged || shouldReload) && !params.environmentName) {
            for (i = 0; i < LIGHT_SOURCES.length; i++) {
                _scene.addDirectionalLightSource(new budaScene.DirectionalLightSource(LIGHT_SOURCES[i].color, LIGHT_SOURCES[i].direction));
            }
        }
        if (shouldReload) {
            _spacecraft = new logic.Spacecraft(_spacecraftClass, undefined, undefined, params.reload ? orientationMatrix : undefined);
            _wireframeSpacecraft = new logic.Spacecraft(_spacecraftClass, undefined, undefined, params.reload ? orientationMatrix : undefined);
        }
        if (equipmentProfileChanged || environmentChanged || shouldReload) {
            if (_equipmentProfileName) {
                _spacecraft.unequip();
                _wireframeSpacecraft.unequip();
                _equipmentProfileName = null;
            }
            if (params.equipmentProfileName) {
                _spacecraft.equipProfile(_spacecraftClass.getEquipmentProfile(params.equipmentProfileName));
                _wireframeSpacecraft.equipProfile(_spacecraftClass.getEquipmentProfile(params.equipmentProfileName));
                _equipmentProfileName = params.equipmentProfileName;
            }
        }
        _spacecraft.addToScene(_scene, undefined, false,
                (environmentChanged || shouldReload) ? {weapons: true, lightSources: true, blinkers: true} : {self: false, weapons: true},
                {
                    replaceVisualModel: true,
                    factionColor: _factionColor
                });
        _wireframeSpacecraft.addToScene(_scene, undefined, true,
                (environmentChanged || shouldReload) ? {weapons: true, lightSources: false, blinkers: false} : {self: false, weapons: true},
                {
                    replaceVisualModel: true,
                    shaderName: WIREFRAME_SHADER_NAME
                },
        (environmentChanged || shouldReload) ?
                function (model) {
                    model.setUniformValueFunction(WIREFRAME_SHADER_COLOR_UNIFORM_NAME, function () {
                        return WIREFRAME_COLOR;
                    });
                } :
                null,
                function (model) {
                    model.setUniformValueFunction(WIREFRAME_SHADER_COLOR_UNIFORM_NAME, function () {
                        return WIREFRAME_COLOR;
                    });
                });
        if (params.environmentName && (environmentChanged || shouldReload)) {
            logic.getEnvironment(params.environmentName).addToScene(_scene);
        }
        _environmentName = params.environmentName;
        _context = _context || new managedGL.ManagedGLContext(MANAGED_CONTEXT_NAME, _elements.canvas, graphics.getAntialiasing(), true, graphics.getFiltering());
        _elements.canvas.hidden = false;
        _elements.canvas.width = _elements.canvas.clientWidth;
        _elements.canvas.height = _elements.canvas.clientHeight;
        resources.executeWhenReady(function () {
            var view, distance;
            _scene.addToContext(_context);
            _context.setup();
            if (shouldReload) {
                if (params.preserve) {
                    orientationMatrix = _scene.getCamera().getCameraOrientationMatrix();
                    distance = vec.length3(mat.translationVector3(_scene.getCamera().getCameraPositionMatrix()));
                } else {
                    distance = DEFAULT_DISTANCE_FACTOR * _spacecraft.getVisualModel().getScaledSize();
                }
                view = new classes.ObjectView({
                    name: OBJECT_VIEW_NAME,
                    isAimingView: false,
                    fps: false,
                    fov: FOV,
                    fovRange: [FOV, FOV],
                    followsPosition: true,
                    followsOrientation: false,
                    movable: true,
                    turnable: true,
                    rotationCenterIsObject: true,
                    distanceRange: [0, MAX_DISTANCE_FACTOR * _spacecraft.getVisualModel().getScaledSize()],
                    position: [0, -distance, 0]
                });
                _scene.getCamera().setConfiguration(_spacecraft.createCameraConfigurationForView(view));
                if (params.preserve) {
                    _scene.getCamera().getConfiguration().setRelativeOrientationMatrix(orientationMatrix, true);
                }
            }
            _elements.canvas.onmousedown = _handleMouseDown;
            _elements.canvas.onwheel = _handleWheel;
            _context.executeWhenReady(function () {
                utils.executeAsync(function () {
                    _updateForRenderMode();
                    _updateForLOD();
                    _requestRender();
                });
            });
        });
        resources.requestResourceLoad();
    }
    /**
     * Resets the preview settings (those handled through the optionns, not the ones connected to the canvas) to their default values.
     * The settings that persist across different items are not reset.
     */
    function _clearSettingsForNewItem() {
        _renderMode = _renderMode || RenderMode.SOLID;
        _lod = (_lod !== undefined) ? _lod : graphics.getLODLevel();
        _environmentName = null;
        _equipmentProfileName = null;
        if (!_factionColor) {
            _factionColorChanged = false;
        }
        if (!_factionColorChanged) {
            _factionColor = _spacecraftClass.getFactionColor().slice();
        }
    }
    /**
     * Creates the controls that form the content of the preview options and adds them to the page.
     */
    function _createOptions() {
        _elements.options.innerHTML = "";
        // render mode selector
        _elements.options.appendChild(_createSettingLabel("Render mode:"));
        _optionElements.renderModeSelector = common.createSelector(utils.getEnumValues(RenderMode), _renderMode, false, function () {
            _renderMode = _optionElements.renderModeSelector.value;
            _updateForRenderMode();
            _requestRender();
        });
        _elements.options.appendChild(_optionElements.renderModeSelector);
        // LOD selector
        _elements.options.appendChild(_createSettingLabel("LOD:"));
        _optionElements.lodSelector = common.createSelector(graphics.getLODLevels(), _lod, false, function () {
            _lod = _optionElements.lodSelector.value;
            _updateForLOD();
            _requestRender();
        });
        _elements.options.appendChild(_optionElements.lodSelector);
        // environment selector
        _elements.options.appendChild(_createSettingLabel("Environment:"));
        _optionElements.environmentSelector = common.createSelector(logic.getEnvironmentNames(), _environmentName, true, function () {
            _updateCanvas({
                preserve: true,
                environmentName: (_optionElements.environmentSelector.value !== "none") ? _optionElements.environmentSelector.value : null,
                equipmentProfileName: _equipmentProfileName
            });
        });
        _elements.options.appendChild(_optionElements.environmentSelector);
        // equipment profile selector
        _elements.options.appendChild(_createSettingLabel("Equipment:"));
        _optionElements.equipmentSelector = common.createSelector(_spacecraftClass.getEquipmentProfileNames(), _equipmentProfileName, true, function () {
            _updateCanvas({
                preserve: true,
                environmentName: _environmentName,
                equipmentProfileName: (_optionElements.equipmentSelector.value !== "none") ? _optionElements.equipmentSelector.value : null
            });
        });
        _elements.options.appendChild(_optionElements.equipmentSelector);
        // faction color picker
        _elements.options.appendChild(_createSettingLabel("Faction color:"));
        _optionElements.factionColorPicker = common.createColorPicker(_factionColor, function () {
            _factionColorChanged = true;
            _updateCanvas({
                preserve: true,
                reload: true,
                environmentName: _environmentName,
                equipmentProfileName: _equipmentProfileName
            });
        });
        _elements.options.appendChild(_optionElements.factionColorPicker);
        _elements.options.hidden = false;
    }
    // ----------------------------------------------------------------------
    // Public Functions
    /**
     * @typedef {Object} refreshElements
     * @property {HTMLCanvasElement} canvas The canvas that can be used to display a preview image of the selected object
     * @property {Element} options The div that houses the preview options
     */
    /**
     * The main function that sets up the preview window (both options and the preview canvas) for the editor to show the selected 
     * spacecraft class.
     * @param {refreshElements} elements References to the HTML elements that can be used for the preview.
     * @param {SpacecraftClass} spacecraftClass The spacecraft class to preview
     * @param {refreshParams} params Additional parameters 
     */
    function refresh(elements, spacecraftClass, params) {
        _elements = elements;
        _spacecraftClass = spacecraftClass;
        _clearSettingsForNewItem();
        _createOptions();
        _updateCanvas(params);
    }
    /**
     * Updates the preview (refreshes if needed) in case the property with the given name changed
     * @param {String} name
     */
    function handleDataChanged(name) {
        if (REFRESH_PROPERTIES.indexOf(name) >= 0) {
            _updateCanvas({
                preserve: true,
                reload: true,
                environmentName: _environmentName,
                equipmentProfileName: _equipmentProfileName
            });
        }
    }
    // ----------------------------------------------------------------------
    // The public interface of the module
    return {
        refresh: refresh,
        handleDataChanged: handleDataChanged
    };
});
