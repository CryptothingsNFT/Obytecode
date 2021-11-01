import {Instructions} from "../vm/ops";
import {isBinaryOp, typeVar} from "./utils";
import {READ_ARGUMENT, REGISTERS} from "../vm/types";

type CTX = {node: number, currentMemorySlot: number, address2var: Record<number, string>, var2address:Record<string, number>, varReplacement: Record<string, string>};

let ctx: CTX = {
    node: -1,
    currentMemorySlot: 0,
    address2var: {},
    var2address: {},
    varReplacement: {}
}

const toBytecode = (ast, bytecode: Array<any> = []): Array<any>=>{
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
            if (ctx.var2address[varname] !== undefined) //The variable name was known at compile time
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
                    else
                        throw new Error(`local_var_assignment of unknown expression ${n[2]}`);
                    return bytecode;
                }
            }
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
            bytecode.push(Instructions.LABEL, ...toBytecode(n[2][1], []), Instructions.END_LABEL, Instructions.NOP);
            return bytecode;
        }
        else if (n[0] === "+" || n[0] === "-" || n[0] === '*' || n[0] === '/' || n[0] === 'concat' || n[0] === 'otherwise'){
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
        else
            throw new Error("[compiler] Unimplemented AST node " + n);
    });
    //Reset for next usage
    setImmediate(()=>ctx = {node: -1, currentMemorySlot: 0, address2var: {}, var2address: {}, varReplacement: {}});
    return bytecode;
}

export default toBytecode;