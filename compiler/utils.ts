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

export const typeVar = (str: string): any=>{
    if (isNumeric(str))
        return parseFloat(str);
    if (str === 'true' || str === 'false')
        return Boolean(str);

    if (isJSON(str))
        return JSON.parse(str);

    if (typeof str === 'boolean' || typeof str === 'string' || typeof str === 'number')
        return str;

    throw new Error(`Cannot properly type ${str} ${typeof str}`);
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