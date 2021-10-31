import nearley from 'nearley';
import ojsonGrammar from './grammars/ojson.js';
import oscriptGrammar from './grammars/oscript.js';

function assignField(obj, field, value) {
    Object.defineProperty(obj, field, {
        value: value,
        writable: true,
        configurable: true,
        enumerable: true
    });
}

const TYPES = {
    STR: 'STR',
    PAIR: 'PAIR',
    TRUE: 'TRUE',
    FALSE: 'FALSE',
    ARRAY: 'ARRAY',
    OBJECT: 'OBJECT',
    DECIMAL: 'DECIMAL',
    FORMULA: 'FORMULA'
};
function getTag(value) {
    if (value == null)
        return value === undefined ? '[object Undefined]' : '[object Null]'
    return toString.call(value)
}
function isPlainObject(value) {
    const isObjectLike = typeof value === 'object' && value !== null;
    if (!isObjectLike || getTag(value) != '[object Object]')
        return false
    if (Object.getPrototypeOf(value) === null)
        return true
    let proto = value
    while (Object.getPrototypeOf(proto) !== null)
        proto = Object.getPrototypeOf(proto)
    return Object.getPrototypeOf(value) === proto
}

function validateFormula (formula, parserResults, context) {
    function searchNewlineRecursive (st) {
        if (Array.isArray(st)) {
            for (let i = 0; i < st.length; i++) {
                searchNewlineRecursive(st[i])
            }
        } else if (st && isPlainObject(st)) {
            var keys = Object.keys(st)
            for (let i = 0; i < keys.length; i++) {
                searchNewlineRecursive(st[keys[i]])
            }
        } else if (typeof st === 'string' && st.includes('\n')) {
            throw new Error(`Error parsing formula starting at line ${context.line} col ${context.col}: newline is not allowed in string '${st}'`)
        }
    }

    if (!Array.isArray(parserResults)) {
        throw new Error(`Error parsing formula starting at line ${context.line} col ${context.col}`)
    } else if (parserResults.length !== 1) {
        throw new Error(`Error parsing formula starting at line ${context.line} col ${context.col}: ambiguous parser result`)
    } else {
        searchNewlineRecursive(parserResults[0])
    }
}

function parseOjsonGrammar (text) {
    const nearleyParser = new nearley.Parser(nearley.Grammar.fromCompiled(ojsonGrammar));
    nearleyParser.feed(text);
    return nearleyParser;
}
function baseValues(object, props) {
    return props == null ? [] : props.map((key) => object[key])
}
function values(object) {
    return object == null ? [] : baseValues(object, Object.keys(object));
}
function parseOscriptGrammar (formula) {
    const nearleyParser = new nearley.Parser(nearley.Grammar.fromCompiled(oscriptGrammar));
    nearleyParser.feed(formula);
    return nearleyParser;
}

function parse (text) {
    let parser;
    try {
        parser = parseOjsonGrammar(text);
    } catch (e) {
        throw new Error('ojson parsing failed: ' + e);
    }
    if (!Array.isArray(parser.results))
        throw new Error('parserResult should be Array');
    if (parser.results.length !== 1)
        throw new Error('parserResult should be Array of length 1');

    try {
        const result = processTree(parser.results[0]);
        return ['autonomous agent', result];
    } catch (e) {
        throw new Error(e.message);
    }

    function processTree (tree) {
        if (tree.type === TYPES.ARRAY) {
            return processAsArray(tree);
        } else if (tree.type === TYPES.STR) {
            return tree.value;
        } else if (tree.type === TYPES.TRUE) {
            return tree.value;
        } else if (tree.type === TYPES.FALSE) {
            return tree.value;
        } else if (tree.type === TYPES.DECIMAL) {
            return tree.value;
        } else if (tree.type === TYPES.FORMULA) {
            const formula = tree.value;
            try {
                parser = parseOscriptGrammar(formula);
                validateFormula(formula, parser.results, tree.context);
                return parser.results;
            } catch (e) {
                const msg = e.message;
                const match = msg.match(/invalid syntax at line ([\d]+) col ([\d]+):([\s\S]+)/m);
                if (match) {
                    const line = Number(match[1]) - 1;
                    const col = Number(match[2]);
                    if (line === 0)
                        throw new Error(`Invalid formula syntax at line ${tree.context.line} col ${tree.context.col + col - 1}:${match[3]}`);
                    else
                        throw new Error(`Invalid formula syntax at line ${tree.context.line + line} col ${col}:${match[3]}`);
                }
                else if (msg.startsWith('Error parsing formula starting at line'))
                    throw new Error(msg)
                else
                    throw new Error(`Invalid formula starting at line ${tree.context.line} col ${tree.context.col}`);
            }
        } else if (tree.type === TYPES.OBJECT) {
            return processAsObject(tree);
        } else if (tree.type === TYPES.PAIR) {
            return { [processTree(tree.key)]: processTree(tree.value) };
        } else {
            throw new Error(`Unknown ojson node type ${tree.type}`);
        }
    }

    function processAsObject (tree) {
        var obj = {};
        for (var i = 0; i < tree.value.length; i++) {
            var st = tree.value[i];
            var res = processTree(st);
            var key = Object.keys(res)[0];
            var value = values(res)[0];
            if (obj.hasOwnProperty(key))
                throw new Error(`Duplicate key '${key}' at line ${st.context.line} col ${st.context.col}`);
            assignField(obj, key, value);
        }
        return obj;
    }
    function processAsArray (tree) {
        var arr = [];
        for (var i = 0; i < tree.value.length; i++) {
            var st = tree.value[i];
            var res = processTree(st);
            arr.push(res);
        }
        return arr;
    }
}

export default parse;