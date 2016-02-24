/**
 * Copyright 2016 Krisztián Nagy
 * @file 
 * @author Krisztián Nagy [nkrisztian89@gmail.com]
 * @licence GNU GPLv3 <http://www.gnu.org/licenses/>
 * @version 0.1
 */

/*jslint nomen: true, white: true*/
/*global define */

/**
 * @param screens
 * @param game
 * @param armadaScreens
 * @param logic
 * @param strings
 */
define([
    "modules/screens",
    "modules/game",
    "armada/screens/shared",
    "armada/logic",
    "armada/strings"
], function (screens, game, armadaScreens, logic, strings) {
    "use strict";
    return {
        mainMenuScreen: new screens.MenuScreen(
                armadaScreens.MAIN_MENU_SCREEN_NAME,
                armadaScreens.MAIN_MENU_SCREEN_SOURCE,
                [{
                        id: strings.MAIN_MENU.NEW_GAME.name,
                        action: function () {
                            game.setScreen(armadaScreens.BATTLE_SCREEN_NAME);
                            game.getScreen().startNewBattle(logic.getLevelFileName(0));
                        }
                    }, {
                        id: strings.MAIN_MENU.DATABASE.name,
                        action: function () {
                            game.setScreen(armadaScreens.DATABASE_SCREEN_NAME);
                        }
                    }, {
                        id: strings.MAIN_MENU.SETTINGS.name,
                        action: function () {
                            game.setScreen(armadaScreens.SETTINGS_SCREEN_NAME);
                        }
                    }, {
                        id: strings.MAIN_MENU.ABOUT.name,
                        action: function () {
                            game.setScreen(armadaScreens.ABOUT_SCREEN_NAME);
                        }
                    }], armadaScreens.MAIN_MENU_CONTAINER_ID),
        settingsMenuScreen: new screens.MenuScreen(
                armadaScreens.SETTINGS_SCREEN_NAME,
                armadaScreens.SETTINGS_SCREEN_SOURCE,
                [{
                        id: strings.SETTINGS.GENERAL.name,
                        action: function () {
                            game.setScreen(armadaScreens.GENERAL_SETTINGS_SCREEN_NAME);
                        }
                    }, {
                        id: strings.SETTINGS.GRAPHICS.name,
                        action: function () {
                            game.setScreen(armadaScreens.GRAPHICS_SCREEN_NAME);
                        }
                    }, {
                        id: strings.SETTINGS.CONTROLS.name,
                        action: function () {
                            game.setScreen(armadaScreens.CONTROLS_SCREEN_NAME);
                        }
                    }, {
                        id: strings.SCREEN.BACK.name,
                        action: function () {
                            game.setScreen(armadaScreens.MAIN_MENU_SCREEN_NAME);
                        }
                    }], armadaScreens.SETTINGS_MENU_CONTAINER_ID),
        ingameMenuScreen: new screens.MenuScreen(
                armadaScreens.INGAME_MENU_SCREEN_NAME,
                armadaScreens.INGAME_MENU_SCREEN_SOURCE,
                [{
                        id: strings.INGAME_MENU.RESUME.name,
                        action: function () {
                            game.closeSuperimposedScreen();
                            game.getScreen().resumeBattle();
                        }
                    }, {
                        id: strings.SETTINGS.CONTROLS.name,
                        action: function () {
                            game.setScreen(armadaScreens.CONTROLS_SCREEN_NAME, true, armadaScreens.SUPERIMPOSE_BACKGROUND_COLOR);
                        }
                    }, {
                        id: strings.INGAME_MENU.QUIT.name,
                        action: function () {
                            game.setScreen(armadaScreens.MAIN_MENU_SCREEN_NAME);
                        }
                    }], armadaScreens.INGAME_MENU_CONTAINER_ID)
    };
});
