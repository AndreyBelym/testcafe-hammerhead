import INTERNAL_ATTRS from '../../../processing/dom/internal-attributes';
import SandboxBase from '../base';
import { isNullOrUndefined, inaccessibleTypeToStr } from '../../utils/types';
import INTERNAL_LITERAL from '../../../processing/script/internal-literal';
import INSTRUCTION from '../../../processing/script/instruction';
import { shouldInstrumentMethod } from '../../../processing/script/instrumented';
import { isWindow, isDocument, isDomElement } from '../../utils/dom';
import { isIE, isFirefox } from '../../utils/browser';

function cloneStyle (style) {
    var clonedStyle = {};

    try {
        for (var i = 0; i < style.length; i++)
            clonedStyle[style[i]] = style[style[i]];

        return clonedStyle;
    }
    catch (e) {
        return null;
    }
}

export default class MethodCallInstrumentation extends SandboxBase {
    constructor (messageSandbox) {
        super();

        this.methodWrappers = {
            // NOTE: When a selector that contains the ':focus' pseudo-class is used in the querySelector and
            // querySelectorAll functions, these functions return an empty result if the browser is not focused.
            // This replaces ':focus' with a custom CSS class to return the current active element in that case.
            getComputedStyle: {
                condition: win => isFirefox && isWindow(win) && win.frameElement,

                method: (win, args) => {
                    var style  = win.getComputedStyle.apply(win, args);
                    var result = style ? cloneStyle(style) : null;

                    try {
                        var changes = [];
                        var element = win.frameElement;

                        while (element.tagName && !result) {
                            changes.push({ element, display: element.style.display });
                            element.display = 'block';
                            element         = element.parentNode;

                            style  = win.getComputedStyle.apply(win, args);
                            result = style ? cloneStyle(style) : null;
                        }

                        changes.forEach(ch => ch.element.style.display = ch.display);

                        return result ? result : null;
                    }
                    catch (e) {
                        return null;
                    }

                }
            },

            querySelector: {
                condition: el => !isIE && (isDocument(el) || isDomElement(el)),

                method: (el, args) => {
                    var selector = args[0];

                    if (typeof selector === 'string')
                        selector = MethodCallInstrumentation._replaceFocusPseudoClass(selector);

                    return el.querySelector(selector);
                }
            },

            querySelectorAll: {
                condition: el => !isIE && (isDocument(el) || isDomElement(el)),

                method: (el, args) => {
                    var selector = args[0];

                    if (typeof selector === 'string')
                        selector = MethodCallInstrumentation._replaceFocusPseudoClass(selector);

                    return el.querySelectorAll(selector);
                }
            },

            postMessage: {
                condition: window => isWindow(window),
                method:    (contentWindow, args) => messageSandbox.postMessage(contentWindow, args)
            },

            write: {
                condition: document => !isDocument(document),
                method:    (document, args) => document.write.apply(document, MethodCallInstrumentation._removeOurWriteMethArgs(args))
            },

            writeln: {
                condition: document => !isDocument(document),
                method:    (document, args) => document.writeln.apply(document, MethodCallInstrumentation._removeOurWriteMethArgs(args))
            }
        };
    }

    // NOTE: Isolate throw statement into a separate function because JS engine doesn't optimize such functions.
    static _error (msg) {
        throw new Error(msg);
    }

    static _removeOurWriteMethArgs (args) {
        if (args.length) {
            var lastArg = args[args.length - 1];

            if (lastArg === INTERNAL_LITERAL.documentWriteBegin || lastArg === INTERNAL_LITERAL.documentWriteEnd) {
                var result = Array.prototype.slice.call(args);

                result.pop();

                return result;
            }
        }

        return args;
    }

    // OPTIMIZATION: http://jsperf.com/call-apply-optimization
    static _fastApply (owner, methName, args) {
        var meth = owner[methName];

        switch (args.length) {
            case 1:
                return meth.call(owner, args[0]);
            case 2:
                return meth.call(owner, args[0], args[1]);
            case 3:
                return meth.call(owner, args[0], args[1], args[2]);
            case 4:
                return meth.call(owner, args[0], args[1], args[2], args[3]);
            case 5:
                return meth.call(owner, args[0], args[1], args[2], args[3], args[4]);
            default:
                return meth.apply(owner, args);
        }
    }

    attach (window) {
        super.attach(window);

        window[INSTRUCTION.callMethod] = (owner, methName, args) => {
            if (isNullOrUndefined(owner))
                MethodCallInstrumentation._error(`Cannot call method '${methName}' of ${inaccessibleTypeToStr(owner)}`);

            if (typeof owner[methName] !== 'function')
                MethodCallInstrumentation._error(`'${methName}' is not a function`);

            // OPTIMIZATION: previously we've performed the
            // `this.methodWrappers.hasOwnProperty(methName)`
            // check which is quite slow. Now we use the
            // fast RegExp check instead.
            if (typeof methName === 'string' && shouldInstrumentMethod(methName) &&
                this.methodWrappers[methName].condition(owner))
                return this.methodWrappers[methName].method(owner, args);

            return MethodCallInstrumentation._fastApply(owner, methName, args);
        };
    }

    static _replaceFocusPseudoClass (selector) {
        return selector.replace(/\s*:focus\b/gi, '[' + INTERNAL_ATTRS.focusPseudoClass + ']');
    }
}
