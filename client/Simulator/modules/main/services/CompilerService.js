/* global angular */

'use strict';

angular.module('app')

        /**
         * Kompilátor HDL
         */
        .factory('CompilerService', ['ParserService', 'ChipSimulationService', function (ParserService, ChipSimulationService) {
                var tokens; //dvourozměrné pole řádků a tokenů
                var curToken; //současný token
                var currentRow = 0; //současné číslo řádek
                var currentTokenOnRow = 0; //současné pořadí tokenu na řádku
                var notTokenRegex = /^<span class=.*<\/span>$|\s+|\n/; //regex pro komentáře a bílé znaky
                var nameRegex = /^[A-Za-z][A-Za-z0-9]*$/; //regex pro názvy chipů a pinů

                return {
                    getTokens: getTokens,
                    compile: compile
                };

                function getTokens() {
                    return tokens;
                }

                /**
                 * Zkompiluje celý obvod a případné chybové hlášky vloží přímo do daného pole
                 * @param {String} plainText text HDL v surové podobě
                 * @return {SimulatedChip} simulovatelný chip nebo false pokud nastala chyba při kompilaci
                 */
                function compile(plainText) {
                    tokens = ParserService.parsePlainTextToRowsOfTokens(plainText);
                    if (_compileHeader() && _compileInputs() && _compileOutputs() && _compileParts() && _setParts()) {
                        return ChipSimulationService.simulatedChip;
                    }
                    return false;
                }

                /**
                 * Vytvoří části obvodu tvořené jinými čipy a přiřadí jim správné piny 
                 * @return {Boolean} false pokud nastala chyba při kompilaci
                 */
                function _setParts() {
                    for (var i = 0; i < ChipSimulationService.parts.length; i++) {
                        if(!ChipSimulationService.addChipPart(ChipSimulationService.parts[i])){
                            return false;
                        }
                    }
                    return true;
                }

                /**
                 * Naplní dané speciální pole a pole interních pinů daným pinem.
                 * @param {Array} specialArray pole do kterého se má vložit pin kromě pole pro interní piny (může být null)
                 * @param {String} pinName název pinu
                 */
                function _pushPinToArrays(specialArray, pinName) {
                    var pin = {'name': pinName, 'value': 0, 'callbacks': []};
                    if (specialArray) {
                        specialArray.push(pin);
                    }
                    if (!ChipSimulationService.internalPins.hasOwnProperty(pinName)) {
                        ChipSimulationService.internalPins[pinName] = pin;
                    }
                }

                /**
                 * Zkompiluje hlavičku obvodu
                 * @return {boolean} false pokud nastala chyba při kompilaci
                 */
                function _compileHeader() {
                    _next();
                    if (!expectKeyword('CHIP')) {
                        return false;
                    }
                    _next();
                    if (!(ChipSimulationService.name = expectChipName())) {
                        return false;
                    }
                    _next();
                    if (!expectChar('{')) {
                        return false;
                    }
                    _next();
                    return true;
                }

                /**
                 * Zkompiluje vstupy
                 * @return {boolean} false pokud nastala chyba při kompilaci
                 */
                function _compileInputs() {
                    var pinName;
                    var input;

                    if (!expectKeyword('IN')) {
                        return false;
                    }
                    _next();
                    if (!(pinName = expectPinName())) {
                        return false;
                    }
                    _pushPinToArrays(ChipSimulationService.inputs, pinName);
                    _next();
                    while (curToken.content === ',') {
                        _next();
                        if (!(pinName = expectPinName())) {
                            return false;
                        }
                        _pushPinToArrays(ChipSimulationService.inputs, pinName);
                        _next();
                    }
                    if (!expectChar(';')) {
                        return false;
                    }
                    _next();
                    return true;
                }

                /**
                 * Zkompiluje výstupy obvodu
                 * @return {boolean} false pokud nastala chyba při kompilaci
                 */
                function _compileOutputs() {
                    var pinName;
                    if (!expectKeyword('OUT')) {
                        return false;
                    }
                    _next();
                    if (!(pinName = expectPinName())) {
                        return false;
                    }
                    _pushPinToArrays(ChipSimulationService.outputs, pinName);
                    _next();
                    while (curToken.content === ',') {
                        _next();
                        if (!(pinName = expectPinName())) {
                            return false;
                        }
                        _pushPinToArrays(ChipSimulationService.outputs, pinName);
                        _next();
                    }
                    if (!expectChar(';')) {
                        return false;
                    }
                    _next();
                    return true;
                }

                /**
                 * Zkompiluje části obvodu
                 * @return {boolean} false pokud nastala chyba při kompilaci
                 */
                function _compileParts() {
                    if (!expectKeyword('PARTS')) {
                        return false;
                    }
                    _next();
                    if (!expectChar(':')) {
                        return false;
                    }
                    _next();
                    if (!expectPart()) {
                        return false;
                    }
                    _next();
                    while (curToken.content !== '}') {
                        if (!expectPart()) {
                            return false;
                        }
                        _next();
                    }
                    return true;
                }

                /**
                 * Zkontroluje, zda následující sekvence tokenů představuje deklaraci části obvodu.
                 * Pokud ne, tak uloží do tokenu chybovou hlášku.
                 * @return {boolean} false pokud nastala chyba při kompilaci
                 */
                function expectPart() {
                    var chip =
                            {
                                'name': '',
                                'pins': {},
                                'nameToken': curToken
                            };
                    //TODO tady by se mělo kontrolovat zda takovej obvod existuje
                    if (!(chip.name = expectChipName())) {
                        return false;
                    }
                    _next();
                    if (!expectChar('(')) {
                        return false;
                    }
                    _next();
                    if (!expectPinAssignment(chip)) {
                        return false;
                    }
                    _next();
                    while (curToken.content === ',') {
                        _next();
                        if (!expectPinAssignment(chip)) {
                            return false;
                        }
                        _next();
                    }
                    if (!expectChar(')')) {
                        return false;
                    }
                    _next();
                    if (!expectChar(';')) {
                        return false;
                    }
                    ChipSimulationService.parts.push(chip);
                    return true;
                }

                /**
                 * Zkontroluje, zda následující sekvence tokenů představuje přiřazení pinů.
                 * Pokud ne, tak uloží do tokenu chybovou hlášku.
                 * @param {object} chip definice chipu
                 * @return {boolean} false pokud nastala chyba při kompilaci
                 */
                function expectPinAssignment(chip) {
                    var pinNameLeft;
                    var pinNameRight;
                    var leftToken = curToken;
                    if (!(pinNameLeft = expectPinName())) {
                        return false;
                    }
                    if (chip.pins.hasOwnProperty(pinNameLeft)) {
                        curToken.errorMes = pinNameLeft + ' pin occurs again';
                        return false;
                    }
                    _next();
                    if (!expectChar('=')) {
                        return false;
                    }
                    _next();
                    if (!(pinNameRight = expectPinName())) {
                        return false;
                    }
                    chip.pins[pinNameLeft] = {
                        'assignment': pinNameRight,
                        'leftToken': leftToken,
                        'rightToken': curToken
                    };
                    _pushPinToArrays(null, pinNameRight);
                    return true;
                }

                /**
                 * Zkontroluje, zda je v současném tokenu validní jméno pinu a pokud ne, tak uloží do tokenu chybovou hlášku.
                 * @return {string/boolean} false pokud nastala chyba při kompilaci, jinak název pinu
                 */
                function expectPinName() {
                    if (!nameRegex.test(curToken.content)) {
                        curToken.errorMes = "Expected chip pin name. And chip pin name must start with letter and can containt just letters or digits. But found " + curToken.content;
                        return false;
                    } else {
                        return curToken.content;
                    }
                }

                /**
                 * Zkontroluje, zda je v současném tokenu validní jméno chipu a pokud ne, tak uloží do tokenu chybovou hlášku.
                 * @return {string/boolean} false pokud nastala chyba při kompilaci, jinak název obvodu
                 */
                function expectChipName() {
                    if (!nameRegex.test(curToken.content)) {
                        curToken.errorMes = "Expected chip name. And chip name must start with letter and can containt just letters or digits. But found " + curToken.content;
                        return false;
                    } else {
                        return curToken.content;
                    }
                }

                /**
                 * Zkontroluje, zda je v současném tokenu daný znak a pokud ne, tak uloží do tokenu chybovou hlášku.
                 * @param {string} char znak
                 * @return {boolean} false pokud nastala chyba při kompilaci
                 */
                function expectChar(char) {
                    if (curToken.content !== char) {
                        curToken.errorMes = "Expected " + char + " but found " + curToken.content;
                        return false;
                    }
                    return true;
                }

                /**
                 * Zkontroluje, zda je v současném tokenu dané klíčové slovo a pokud ne, tak uloží do tokenu chybovou hlášku.
                 * @param {string} keyword očekávané klíčové slovo
                 * @return {boolean} false pokud nastala chyba při kompilaci
                 */
                function expectKeyword(keyword) {
                    if (curToken.content !== keyword) {
                        curToken.errorMes = "Expected " + keyword + " but found " + curToken.content;
                        return false;
                    }
                    return true;
                }

                /**
                 * Přeskočí všechny bílé znaky, komentáře a do současného tokenu uloží první opravdový token, který najde
                 */
                function _next() {
                    if (currentTokenOnRow < tokens[currentRow].length) {
                        currentTokenOnRow++;
                    } else {
                        currentRow++;
                        currentTokenOnRow = 0;
                    }

                    for (currentRow; currentRow < tokens.length; currentRow++) {
                        for (currentTokenOnRow; currentTokenOnRow < tokens[currentRow].length; currentTokenOnRow++) {
                            curToken = tokens[currentRow][currentTokenOnRow];
                            if (!notTokenRegex.test(curToken.content)) {
                                return;
                            }
                        }
                        currentTokenOnRow = 0;
                    }
                }
            }]);
