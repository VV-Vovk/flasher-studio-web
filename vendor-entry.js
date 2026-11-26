export {ESPLoader,Transport} from 'esptool-js';
export {serial} from 'web-serial-polyfill';
import MD5 from 'crypto-js/md5';
import WordArray from 'crypto-js/lib-typedarrays';
export const md5 = bytes => MD5(WordArray.create(bytes)).toString();
