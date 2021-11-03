import {Instructions, WideOpcodes} from "../vm/ops";
import {bytecode2ASM, isBinaryOp, isInAST, replaceDeep, typeVar} from "./utils";
import {READ_ARGUMENT, REGISTERS} from "../vm/types";

type CTX = {functionCode:Array<any>, currentFn: number, functions: Record<string, number>, node: number, currentMemorySlot: number, address2var: Record<number, string>, var2address:Record<string, number>, varReplacement: Record<string, string>};

let ctx: CTX = {
    node: -1,
    currentFn: 0,
    functions: {},
    currentMemorySlot: 0,
    address2var: {},
    var2address: {},
    varReplacement: {},
    functionCode: []
}

const hoistFns = (bytecode: Array<any>, extracted = []): Array<any>=>{
    let fnStart;
    let fnCount = 0;
    let i = 0;
    while (i<bytecode.length){
        if (bytecode[i] === Instructions.LABEL) {
            fnStart = i;
            fnCount++;
        }
        else if (bytecode[i] === Instructions.END_LABEL) {
            const fnLength = i-fnStart+2;
            extracted.push(...bytecode.splice(fnStart, fnLength)); //Store function and delete it from bytecode
            i = 0;
            continue;
        }
        if (WideOpcodes.has(bytecode[i]))
            i++;
        i++;
    }
    if (fnCount > extracted.length)
        return hoistFns([...extracted, ...bytecode], extracted);
    return [...extracted, ...bytecode];
}

const isFnKnown = (body: Array<any>): boolean=>{
    const key: string = JSON.stringify(body);
    if (ctx.functions[key] !== undefined)
        return true;
    return false;
}

const toBytecode = (ast, bytecode: Array<any> = [], localCtx?: any): Array<any>=>{
    if (!Array.isArray(ast[0]))
        ast = [ast];
    ast.forEach((n: Array<any>)=>{
        ctx.node++;
        if (n[0] === 'main')
            return toBytecode(n[1], bytecode);
        else if (n[0] === "local_var") {
            const varname = Array.isArray(n[1]) ? toBytecode(n[1]) : [n[1]];
            const isIMMNeeded: boolean = !Array.isArray(n[1]);
            // @ts-ignore
            if (ctx.var2address[varname] !== undefined) //The variable name was known at compile time TODO MIGHT BE BUGGY
                { // @ts-ignore
                    bytecode.push(Instructions.LOAD, ctx.var2address[varname]);
                }
            else {    //The variable name was not known at compile time. It might be a variable stored in the map
                if (isIMMNeeded) //varname is an immediate value
                    bytecode.push(Instructions.IMM, ...varname, Instructions.GET);
                else //varname is computed and then read from the stack
                    bytecode.push(...varname, Instructions.GET);
            }
            return bytecode;
        }
        else if (n[0] === 'local_var_assignment') {
            const usesMap: boolean = Array.isArray(n[1]) || (n[2][0] === 'local_var' && Array.isArray(n[2][1]));
            if (usesMap){
                const key: Array<any> = Array.isArray(n[1]) ? toBytecode(n[1]) : [n[1]];
                const value: Array<any> = Array.isArray(n[2]) ? toBytecode(n[2]) : [n[2]];
                const isKeyIMM: boolean = !Array.isArray(n[1]);
                if (isKeyIMM) {
                    bytecode.push(
                        ...value,
                        Instructions.IMM, ...key,
                        Instructions.SET
                    );
                }
                else {
                    bytecode.push(
                        ...value,
                        ...key,
                        Instructions.SET
                    );
                }
                return bytecode;
            }
            else {
                const varname: string = n[1];
                if (ctx.var2address[varname] && !varname.startsWith('[')) //Parameter local vars start with [
                    throw new Error(`Variable ${n[1]} was redeclared`);
                const value: any = n[2];
                ctx.var2address[varname] = ctx.currentMemorySlot;
                ctx.address2var[ctx.currentMemorySlot] = varname;
                ctx.currentMemorySlot++;
                if (!Array.isArray(value)) { //Is immediate value
                    bytecode.push(
                        Instructions.IMM, typeVar(value),
                        Instructions.MEM, ctx.var2address[varname]
                    );
                    return bytecode;
                }
                else { //Value must be calculated
                    if (n[2][0] === "local_var") { //Assigning var to another var
                        const lhs: string = n[1];
                        const rhs: string = n[2][1];
                        if (Array.isArray(rhs)) //$var = ${computed var name};
                            bytecode.push(...toBytecode(rhs), Instructions.GET);
                        //OPTIMIZED OUT
                        //bytecode.push(Instructions.LOAD, ctx.var2address[rhs], Instructions.MEM, ctx.var2address[lhs]);
                        //END_OPTIMIZED_OUT

                        //OPTIMIZATION: Inline variable to save ops and memory tape
                        else { //Normal var assignment, references can be inlined
                            ctx.currentMemorySlot--;
                            ctx.var2address[lhs] = ctx.var2address[rhs];
                        }
                        return bytecode;
                        //END_OPTIMIZATION
                    }
                    else if (isBinaryOp(n[2][0]))
                        bytecode.push(...toBytecode(n[2]), Instructions.MEM, ctx.var2address[varname]);
                    else if (n[2][0] === 'array'){ //Defining an array
                        ctx.currentMemorySlot--;
                        ctx.var2address[varname] = ctx.currentMemorySlot;
                        ctx.address2var[ctx.currentMemorySlot] = varname;
                        //Trivial arrays are homogeneous, compact and of trivial types
                        const isTrivialArray: boolean = n[2][1].map(x=>typeVar(x)).every((x, i, arr)=>typeof x === typeof arr[0] && !Array.isArray(x) && typeof x !== 'object');
                        if (isTrivialArray)
                            bytecode.push(Instructions.IMM, n[2][1].map(x=>typeVar(x)), Instructions.MEM, ctx.var2address[varname]);
                        else {
                            bytecode.push(
                                Instructions.IMM, [],
                                Instructions.MEM, ctx.var2address[varname],
                                ...toBytecode(n[2], [], {array: varname}),
                                Instructions.MEM, ctx.var2address[varname],
                            );
                        }
                        ctx.currentMemorySlot++;
                        return bytecode;
                    }
                    else {
                        const value = toBytecode(n[2]);
                        bytecode.push(
                            ...value,
                            Instructions.MEM, ctx.var2address[varname]
                        );
                    }
                    //else
                    //    throw new Error(`[COMPILER] local_var_assignment of unknown expression ${JSON.stringify(n)}`);
                    return bytecode;
                }
            }
        }
        else if (n[0] === "array") { //Array initialization
            //Load the array object
            bytecode.push(Instructions.LOAD, ctx.var2address[localCtx.array]);
            n[1]?.forEach((x, i)=>{
                const value: Array<any> = Array.isArray(x) ? toBytecode(x) : [Instructions.IMM, typeVar(x)];
                bytecode.push(
                    Instructions.IMM, i,
                    ...value,
                    Instructions.DEF
                );
            });
            return bytecode;
        }
        else if (n[0] === "with_selectors") {
            const object: Array<any> = toBytecode(n[1]);
            const key: Array<any> = Array.isArray(n[2][0]) ? toBytecode(n[2]) : [Instructions.IMM, typeVar(n[2][0])];
            bytecode.push(
                ...object,
                ...key,
                Instructions.PICK
            );
            return bytecode;
        }
        else if (n[0] === "bounce") {
            if (!Array.isArray(n[1]))
                bytecode.push(Instructions.IMM, n[1], Instructions.ABORT);
            else
                bytecode.push(...toBytecode(n[1]), Instructions.ABORT);
            return bytecode;
        }
        else if (n[0] === "return"){
            bytecode.push(...toBytecode(n[1], [])); //Saves return value into the stack
            return bytecode;
        }
        else if (n[0] === "func_declaration"){
            const fnInnerBody: Array<any> = toBytecode(n[2], []);
            let renamedInnerBody: Array<any> = [...n[2]];

            if (!isFnKnown(fnInnerBody)) { //Only emit bytecode if the function is unknown
                const fnKey: string = JSON.stringify(fnInnerBody);
                for (let i=0;i<n[1].length;++i)
                    renamedInnerBody = replaceDeep(renamedInnerBody, ['local_var', n[1][i]], ['local_var', fnKey+i]);
                const fnBody: Array<any> = [...toBytecode(n[1].map((x, i)=>['local_var_assignment', fnKey+i, 0])), Instructions.LABEL, ctx.currentFn, ...toBytecode(renamedInnerBody), Instructions.END_LABEL, Instructions.NOP];
                bytecode.push(...fnBody);
                ctx.functions[fnKey] = ctx.currentFn;
                ctx.currentFn++;
                return bytecode
            }
            return [];
        }
        else if (n[0] === "+" || n[0] === "-" || n[0] === '*' || n[0] === '/' || n[0] === '^' || n[0] === 'concat' || n[0] === 'otherwise'){
            const op1 = Array.isArray(n[1]) ? [...toBytecode(n[1])] : [Instructions.IMM, typeVar(n[1])];
            const op2 = Array.isArray(n[2]) ? [...toBytecode(n[2])] : [Instructions.IMM, typeVar(n[2])];

            let binaryOp: number;
            if (n[0] === 'concat' || n[0] === '+')
                binaryOp = Instructions.ADD;
            else if (n[0] === '-')
                binaryOp = Instructions.SUB;
            else if (n[0] === '*')
                binaryOp = Instructions.MUL;
            else if (n[0] === '/')
                binaryOp = Instructions.DIV;
            else if (n[0] === '^')
                binaryOp = Instructions.POW;
            else if (n[0] === 'otherwise') {
                bytecode.push(
                    ...op1,
                    Instructions.DUP_HEAD,
                    Instructions.IS_TRUTHY,
                    Instructions.IMM, true,
                    //If operator 1 is truthy we need to skip pushing op2 into the stack
                    Instructions.SKIP_EQ, op2.length+1,
                    //Delete duped head
                    Instructions.POP_HEAD,
                    //Push op2 into the stack
                    ...op2,
                );
                return bytecode;
            }

            bytecode.push(...op1, ...op2, binaryOp);
            return bytecode;
        }
        else if (n[0] === 'this_address'){
            bytecode.push(Instructions.READ, READ_ARGUMENT.THIS_ADDRESS);
            return bytecode;
        }
        else if (n[0].startsWith('trigger.')){
            bytecode.push(
                Instructions.READ, READ_ARGUMENT.TRIGGER,
                Instructions.IMM, (n[0] as string).split('.')[1],
                Instructions.PICK
            );
        }
        else if (n[0] === 'mci'){
            bytecode.push(Instructions.READ, READ_ARGUMENT.MCI);
            return bytecode;
        }
        else if (n[0] === 'timestamp'){
            bytecode.push(Instructions.READ, READ_ARGUMENT.TIMESTAMP);
            return bytecode;
        }
        else if (n[0] === 'balance'){
            if (n[2] === null) {
                n[2] = 'base';
                n[1] = null;
            }
            const ofAddress: Array<any> = typeof n[1] === 'string' ? [Instructions.IMM, n[1]] : toBytecode(['this_address']);

            const asset: Array<any> = typeof n[2] === 'string' ? [Instructions.IMM, n[2]] : toBytecode(n[2]); //Wanted to read an expression
            bytecode.push(
                ...ofAddress,
                Instructions.REG, REGISTERS.ADDRESS_REGISTRY1,
                ...asset,
                Instructions.REG, REGISTERS.ASSET_REGISTRY,
                Instructions.READ, READ_ARGUMENT.BALANCE
            );
            return bytecode;
        }
        else if (n[0] === 'var'){
            if (n[2] === null) {
                n[2] = n[1];
                n[1] = ['this_address'];
            }
            const name: Array<any> = Array.isArray(n[2]) ? toBytecode(n[2]) : [Instructions.IMM, n[2]];
            const address: Array<any> = Array.isArray(n[1]) ? toBytecode(n[1]) : [Instructions.IMM, n[1]];
            bytecode.push(
                ...address,
                Instructions.REG, REGISTERS.ADDRESS_REGISTRY1,
                ...name,
                Instructions.READ, READ_ARGUMENT.VARIABLE
            );
            return bytecode;
        }
        else if (n[0] === 'asset'){
            const hash: Array<any> = Array.isArray(n[1]) ? toBytecode(n[1]) : [Instructions.IMM, n[1]];
            const field: Array<any> = Array.isArray(n[2]) ? toBytecode(n[2]) : [Instructions.IMM, n[2]];
            bytecode.push(
                ...hash,
                Instructions.REG, REGISTERS.ASSET_REGISTRY,
                Instructions.READ, READ_ARGUMENT.ASSET,
                ...field,
                Instructions.PICK
            );
        }
        else if (n[0] === 'ifelse'){
            const condition: Array<any> = Array.isArray(n[1])
                ? toBytecode(n[1])
                : [Instructions.IMM, n[1]]; //Possible optimization here. The if is a constant value which can be evaluated during compilation
            const ifBody: Array<any> = toBytecode(n[2]);
            const elseBody: Array<any> = Array.isArray(n[3]) ? toBytecode(n[3]) : [];
            bytecode.push(
                ...condition, Instructions.IS_TRUTHY,
                Instructions.IMM, true,
                Instructions.SKIP_NEQ, ifBody.length,
                ...ifBody,
                ...elseBody
            )
        }
        else if (n[0] === 'comparison'){
            const comparison: number =
                  n[1] === '==' ? Instructions.EQUAL
                : n[1] === '>'  ? Instructions.GT
                : n[1] === '<'  ? Instructions.LT
                : n[1] === '>=' ? Instructions.GTE
                : n[1] === '<=' ? Instructions.LTE
                : Instructions.NEQUAL;
            const op1: Array<any> = Array.isArray(n[2]) ? toBytecode(n[2]) : [Instructions.IMM, n[2]];
            const op2: Array<any> = Array.isArray(n[3]) ? toBytecode(n[3]): [Instructions.IMM, n[3]];
            bytecode.push(...op1, ...op2, comparison);
            return bytecode;
        }
        else if (n[0] === 'map'){
            const array: Array<any> = toBytecode(n[1]);
            const fn: Array<any> = Array.isArray(n[3]) ? toBytecode(n[3]) : n[3][1]; //Else is local var
            const innerBody: Array<any> = toBytecode(n[3][2]);
            const fnKey: string = JSON.stringify(toBytecode(n[3][2]));
            if (Array.isArray(n[3])) //Declare the callback first (empty if the function has been deduped)
                bytecode.push(...fn);
            const maxLength: number = typeVar(n[2]);
            const usesIndex: boolean = n?.[3]?.[1]?.length === 2 && isInAST(n[3][2], ["local_var", n[3][1][1]]); //CB has one argument & it is used at least once in the function
            bytecode.push(
                ...array,
                Instructions.IMM, ctx.var2address[fnKey+'0'], //ELEMENT
                Instructions.IMM, maxLength,
                ...(usesIndex ? [Instructions.IMM, true] : []),

                //[array, maxLength]
                Instructions.MAP, ctx.functions[JSON.stringify(innerBody)],
            ); //Load the array into the stack [array, array]
            return bytecode;
        }
        else
            throw new Error("[compiler] Unimplemented AST node " + n);
    });
    //Reset for next usage
    return bytecode;
}

export default (ast: Array<any>)=>{
    const raw: Array<any> = toBytecode(ast);
    const processed: Array<any> = hoistFns(raw);
    setImmediate(()=>ctx = { functionCode: [], currentFn: 0, functions: {}, node: -1, currentMemorySlot: 0, address2var: {}, var2address: {}, varReplacement: {}});
    return processed;
};