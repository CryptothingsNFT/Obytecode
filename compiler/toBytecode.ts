import {Instructions} from "../vm/ops";
import {bytecode2ASM, isBinaryOp, replaceDeep, typeVar} from "./utils";
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

const toBytecode = (ast, bytecode: Array<any> = [], localCtx?: any): Array<any>=>{
    if (!Array.isArray(ast[0]))
        ast = [ast];
    ast.forEach((n: Array<any>)=>{
        ctx.node++;
        if (n[0] === 'main')
            return toBytecode(n[1], bytecode);
        else if (n[0] === "local_var") {
            const varname = Array.isArray(n[1]) ? toBytecode(n[1]) : [n[1]];
            const isIMMNeeded = !Array.isArray(n[1]);
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
                if (ctx.var2address[varname])
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
                        bytecode.push(
                            Instructions.IMM, [],
                            Instructions.MEM, ctx.var2address[varname],
                            ...toBytecode(n[2], [], {array: varname})
                            );
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
            bytecode.push(Instructions.POP_HEAD); //Delete the object from the head (will persist in memory)
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
            n[1].forEach(x=>n[2] = replaceDeep(n[2], ['local_var', x], ['bytecode', []]));
            bytecode.push(Instructions.LABEL, ctx.currentFn, ...toBytecode(n[2], []), Instructions.END_LABEL, Instructions.NOP);
            ctx.functions[JSON.stringify(bytecode)] = ctx.currentFn;
            return bytecode;
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
        else if (n[0] === 'map'){ //TODO if array is not too long we should use loop unrolling instead to save ops
            const array: Array<any> = toBytecode(n[1]);
            const fn: Array<any> = Array.isArray(n[3]) ? toBytecode(n[3]) : n[3][1]; //Else is local var
            if (Array.isArray(n[3])) //Declare the callback first
                bytecode.push(...fn);
            const maxLength: number = typeVar(n[2]);
            const usesIndex: boolean = n?.[3]?.[1]?.length === 2; //CB has one argument

            bytecode.push(
                ...array,
                Instructions.DUP_HEAD,
                Instructions.REG, REGISTERS.GENERAL_REGISTRY2
            ); //Load the array into the stack [array, array]

            bytecode.push(
                Instructions.LENGTH, //[array, length]
                Instructions.DUP_HEAD,//[array, length, length]
                Instructions.IMM, maxLength, //[array, length, length, maxlength]
                Instructions.GTE, //[array, length, l>=ml]
                Instructions.IMM, true, //[array, length, l=>ml, true]
                Instructions.SKIP_NEQ, 13, //[array, length]
                    //True length is higher than maxLength. The array must be truncated
                    Instructions.UNREG, REGISTERS.GENERAL_REGISTRY2, // [array, length, array]
                    Instructions.IMM, maxLength, //[array, length, array, maxLength]
                    Instructions.TRUNC, //[array, length, arrayTrunc] the array has been truncated to maxLength
                    Instructions.REG, REGISTERS.GENERAL_REGISTRY2, //[array, length](not necessary since a reference is being used)
                    Instructions.REG, REGISTERS.GENERAL_REGISTRY3, //[array]
                    Instructions.DUP_HEAD,
                    Instructions.SKIP, 9,
                Instructions.REG, REGISTERS.GENERAL_REGISTRY3, //[array] Length is stored in GR3
                Instructions.POP_HEAD, //[]
                Instructions.UNREG, REGISTERS.GENERAL_REGISTRY2,//[truncArr]
                Instructions.DUP_HEAD, //[truncArr, truncArr]
                Instructions.UNREG, REGISTERS.GENERAL_REGISTRY1, //[truncArr, truncArr, 0]
                //Last SKIP lands here
                Instructions.IMM, 0,
                Instructions.DUP_HEAD,
                Instructions.REG, REGISTERS.GENERAL_REGISTRY1,
            ); //Set the loop counter to 0 [array, array]
            //Stack has [arrayTrunc, arrayTrunc, index] This is the for loop boy
            bytecode.push(
                Instructions.PICK, //[array, picked]
                ...(usesIndex ? [Instructions.UNREG, REGISTERS.GENERAL_REGISTRY1, Instructions.SWAP] : []),
                Instructions.CALL, ctx.functions[JSON.stringify(fn)],//Call the cb [array, mapped]
                Instructions.REG, REGISTERS.GENERAL_REGISTRY2, //[array]
                Instructions.DUP_HEAD, //[array, array]
                Instructions.UNREG, REGISTERS.GENERAL_REGISTRY1, //[array, array, index]
                Instructions.UNREG, REGISTERS.GENERAL_REGISTRY2, //[array, array, index, mapped]
                Instructions.DEF, //[array, array]

                Instructions.INC, REGISTERS.GENERAL_REGISTRY1,
                Instructions.UNREG, REGISTERS.GENERAL_REGISTRY1, //[array, array, index]
                Instructions.DUP_HEAD, //[array, array, index, index]
                Instructions.IMM, maxLength, //[array, array, index, index, max]
                Instructions.SKIP_NEQ, (usesIndex ? -23 : -20) //[array, array, current]
            );
            bytecode.push(Instructions.POP_HEAD, Instructions.POP_HEAD); // [array] delete index and array copy
            return bytecode;
        }
        else if (n[0] === 'bytecode')
            return n[1];
        else
            throw new Error("[compiler] Unimplemented AST node " + n);
    });
    //Reset for next usage
    setImmediate(()=>ctx = { functionCode: [], currentFn: 0, functions: {}, node: -1, currentMemorySlot: 0, address2var: {}, var2address: {}, varReplacement: {}});
    return bytecode;
}

export default toBytecode;