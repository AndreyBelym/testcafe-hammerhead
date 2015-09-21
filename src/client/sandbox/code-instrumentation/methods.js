import SandboxBase from '../base';
import { isNullOrUndefined, inaccessibleTypeToStr } from '../../utils/types';
import { DOCUMENT_WRITE_BEGIN_PARAM, DOCUMENT_WRITE_END_PARAM, CALL_METHOD_METH_NAME } from '../../../processing/js';
import { FOCUS_PSEUDO_CLASS_ATTR } from '../../../const';
import { isWindow, isDocument, isDomElement } from '../../utils/dom';
import { isIE } from '../../utils/browser';

export default class MethodCallInstrumentation extends SandboxBase {
    constructor (sandbox) {
        super(sandbox);

        this.methodWrappers = {
            // NOTE: When a selector that contains the ':focus' pseudo-class is used in the querySelector and
            // querySelectorAll functions, the latter return an empty result if the browser is not focused.
            // This replaces ':focus' with a custom CSS class to return the current active element in that case.
            querySelector: {
                condition: element => !isIE && (isDocument(element) || isDomElement(element)),

                method: (element, args) => {
                    var selector = args[0];

                    if (typeof selector === 'string')
                        selector = MethodCallInstrumentation._replaceFocusPseudoClass(selector);

                    return element.querySelector(selector);
                }
            },

            querySelectorAll: {
                condition: element => !isIE && (isDocument(element) || isDomElement(element)),

                method: (element, args) => {
                    var selector = args[0];

                    if (typeof selector === 'string')
                        selector = MethodCallInstrumentation._replaceFocusPseudoClass(selector);

                    return element.querySelectorAll(selector);
                }
            },

            postMessage: {
                condition: window => isWindow(window),
                method:    (contentWindow, args) => this.sandbox.message.postMessage(contentWindow, args)
            },

            write: {
                condition: document => !isDocument(document),
                method:    (document, args) => document.write.apply(document, this._removeOurWriteMethArgs(args))
            },

            writeln: {
                condition: document => !isDocument(document),
                method:    (document, args) => document.writeln.apply(document, this._removeOurWriteMethArgs(args))
            }
        };
    }

    //NOTE: isolate throw statement into separate function because JS engines doesn't optimize such functions.
    _error (msg) {
        throw new Error(msg);
    }

    _removeOurWriteMethArgs (args) {
        if (args.length) {
            var lastArg = args[args.length - 1];

            if (lastArg === DOCUMENT_WRITE_BEGIN_PARAM || lastArg === DOCUMENT_WRITE_END_PARAM) {
                var result = Array.prototype.slice.call(args);

                result.pop();

                return result;
            }
        }

        return args;
    }

    attach (window) {
        super.attach(window);

        window[CALL_METHOD_METH_NAME] = (owner, methName, args) => {
            if (isNullOrUndefined(owner))
                this._error('Cannot call method \'' + methName + '\' of ' + inaccessibleTypeToStr(owner));

            if (typeof owner[methName] !== 'function')
                this._error('\'' + methName + '\' is not a function');

            if (typeof methName !== 'string' || !this.methodWrappers.hasOwnProperty(methName))
                return owner[methName].apply(owner, args);

            return this.methodWrappers[methName].condition(owner) ?
                   this.methodWrappers[methName].method(owner, args) : owner[methName].apply(owner, args);
        };
    }

    static _replaceFocusPseudoClass (selector) {
        return selector.replace(/\s*:focus\b/gi, '[' + FOCUS_PSEUDO_CLASS_ATTR + ']');
    }
}
