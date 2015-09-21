import { locationClass } from '../sandbox/native-methods';

export function inaccessibleTypeToStr (obj) {
    return obj === null ? 'null' : 'undefined';
}

export function isLocation (instance) {
    if (instance instanceof locationClass)
        return true;

    return instance && typeof instance === 'object' && typeof instance.href !== 'undefined' &&
           typeof instance.assign !== 'undefined';
}

export function isNullOrUndefined (obj) {
    return !obj && (obj === null || typeof obj === 'undefined');
}

export function isSVGElement (obj) {
    return window.SVGElement && obj instanceof window.SVGElement;
}

