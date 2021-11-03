import {InstructionSet} from "../vm/ops";
import type {Opcode} from "../vm/types";

export const isNumeric = (str: string): boolean=>{
    if (typeof str !== "string")
        return false // we only process strings!
    // @ts-ignore
    return !isNaN(str) && // use type coercion to parse the _entirety_ of the string (`parseFloat` alone does not do this)...
        !isNaN(parseFloat(str)) // ...and ensure strings of whitespace fail
}

export const whichType = (str: string): string=>{
    if (isNumeric(str))
        return "NUMBER";
    throw new Error(`Unknown type of ${str} ${typeof str}`);
}

const isJSON = (str: string): boolean=>{
    try {JSON.parse(str);} catch (e) {return false;}
    return true;
}

export const typeVar = (str: any): any=>{
    if (isNumeric(str))
        return parseFloat(str);
    if (str === 'true' || str === 'false')
        return Boolean(str);

    if (isJSON(str))
        return JSON.parse(str);

    if (typeof str === 'boolean' || typeof str === 'string' || typeof str === 'number')
        return str;

    return str;
}

export const isBinaryOp = (str: string): boolean=>str === '+' || str === '-' || str === '*' || str === '/' || str === 'concat' || str === 'otherwise';

export const replaceDeep = (array: Array<any>, search, replacement: any)=>{
    const copy: Array<any> = JSON.parse(JSON.stringify(array));
    copy.forEach((v: any, i: number)=>{
        if (JSON.stringify(v) === JSON.stringify(search))
            copy[i] = replacement;
        else if (Array.isArray(v))
            copy[i] = replaceDeep(v, search, replacement);
    });
    return copy;
}

export const bytecode2ASM = (bytecode: Array<any>)=>{
    const output: Array<any> = [];
    for (let i=0;i<bytecode.length;++i){
        const [asm, op]: [string, Opcode] = Object.entries(InstructionSet).find(([k, v])=>v.code === bytecode[i]);
        output.push(asm);
        if (op.wide) {
            i++;
            output.push(bytecode[i]);
        }
    }
    return output;
}

export const replaceOpcodes = (code: Array<any>, search: Array<number>, replacement: Array<number>)=>{
    let match: number = 0;

    for (let i = 0; i<code.length;i++){
        if (code[i] === search[match])
            match++;
        if (match === search.length){
            code.splice(i-match, match, replacement);
            match = 0;
        }
        if (InstructionSet[code[i]].wide)
            i++;
    }
    return code.flat();
}

export const isInAST = (AST: Array<any>, search: Array<any>): boolean=>{
    return AST.map(x=>{
        if (JSON.stringify(x) === JSON.stringify(search))
            return true;
        if (Array.isArray(x))
            return isInAST(x, search);
    }).some(x=>x===true);
}