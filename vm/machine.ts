import {createHash} from "crypto";
import {Assertions, Gas, Instructions, WideOpcodes} from './ops';
import READ from "./implementation/READ";
import {DIGEST_ENCODINGS, REGISTERS} from "./types";

export type ExecutionOutput = {
    stack: Array<any>,
    gas: number,
    stateChanges?: Record<string, string>,
    apps?: Array<Record<string, any>>
}
export type ExecutionOptions = {
    debug?: boolean,
    log?: boolean
}
export type InitialExecutionContext = {
    trigger_unit: string,
    this_address: string
}
export type Machine = {
    stack: Array<any>,
    ctx: {
        trigger_unit: string,
        this_address: string
    }
    regs: Array<any>,
    memory: Array<any>,
    userland: Array<any>,
    apps: Array<Record<string, any>>,
    labels: Record<string, [number, number]>,
    map: Record<string | number, any>,
    stateChanges: Record<string, string>,
    stackMax: number,
    usedGas: number,
    pc: number,
    push: (val: any)=>void,
    pop: ()=>any,
    peek: (n: number)=>any,
    debug: ()=>void,
    abort: (str: string)=>{ stack: any; gas: any; stateChanges: any; apps: any, error?: string },
    load: (code: Array<any>, ctx: {trigger_unit: string, this_address: string})=>void
}

const makeRun: (state: Machine, opts: ExecutionOptions)=>()=>ExecutionOutput = (state: Machine, opts: ExecutionOptions)=>{
    let instruction: number = null;
    let next: any;
    let lhs: any, rhs: any; //Used for multiple opcodes
    state.regs[REGISTERS.TRIGGER_REGISTRY] = state.ctx.trigger_unit;
    state.regs[REGISTERS.THIS_ADDRESS_REGISTRY] = state.ctx.this_address;
    if (opts?.log || opts?.debug)
        console.log("Initial memory", state.memory);
    return ()=> {
        while (instruction !== Instructions.NOP && state.pc < state.memory.length) {
            instruction = state.memory[state.pc];
            if (opts?.log)
                console.log("Evaluating", Object.keys(Instructions).find(x => Instructions[x] === instruction), WideOpcodes.has(instruction) ? next : undefined);
            if (Assertions[instruction]) {
                const errored = Assertions[instruction].bind(state)();
                if (errored)
                    return errored;
            }
            state.usedGas += (typeof Gas[instruction] === 'number') ? Gas[instruction] : (Gas[instruction] as () => number).bind(state)();

            if (state.pc + 1 < state.memory.length) // only read an entire word if there's a word's worth of address space left
                next = state.memory[state.pc + 1];
            else
                next = null;
            if (opts?.debug)
                state.debug();

            // check for well-formed instructions
            if (WideOpcodes.has(instruction) && next === null)
                return state.abort('Expected immediate / address!');

            // execute instructions
            switch (instruction) {
                case Instructions.END_LABEL:
                    break;
                case Instructions.NOP:
                    break;
                case Instructions.IMM: {
                    state.push(next);
                    break;
                }
                case Instructions.ADD:
                    rhs = state.pop();
                    lhs = state.pop();
                    state.push(lhs + rhs);
                    break;
                case Instructions.SUB:
                    rhs = state.pop();
                    lhs = state.pop();
                    state.push(lhs - rhs);
                    break;
                case Instructions.MUL:
                    rhs = state.pop();
                    lhs = state.pop();
                    state.push(lhs * rhs);
                    break;
                case Instructions.DIV:
                    rhs = state.pop();
                    lhs = state.pop();
                    state.push(lhs / rhs | 0); // integer division, rounds towards 0 (unlike Math.floor)
                    break;
                case Instructions.JEQ:
                    rhs = state.pop();
                    lhs = state.pop();
                    if (lhs === rhs)
                        state.pc = state.regs[REGISTERS.JUMP_REGISTRY];
                    else
                        state.pc++;
                    break;
                case Instructions.JNE:
                    rhs = state.pop();
                    lhs = state.pop();
                    if (lhs !== rhs)
                        state.pc = state.regs[REGISTERS.JUMP_REGISTRY];
                    else
                        state.pc++;
                    break;
                case Instructions.LOAD:
                    state.push(state.userland[next]);
                    break;
                case Instructions.MEM: {
                    state.userland[next] = state.pop();
                    break;
                }
                case Instructions.POP_HEAD:
                    state.pop();
                    break;
                case Instructions.IS_TRUTHY:
                    const what = state.pop();
                    const isFalsy: boolean = what === undefined || what === null || what === 0 || what === false;
                    state.push(!isFalsy);
                    break;

                case Instructions.PICK: {
                    const key: string = state.pop();
                    const object: Array<any> | Record<string, any> = state.pop();
                    state.push(object[key]);
                    break;
                }
                case Instructions.SET: {
                    const key = state.pop();
                    const value = state.pop();
                    state.map[key] = value;
                    break;
                }
                case Instructions.GET: {
                    const key = state.pop();
                    state.push(state.map[key]);
                    break;
                }
                case Instructions.SKIP_EQ: {
                    const cmp1: any = state.pop();
                    const cmp2: any = state.pop();
                    if (cmp1 === cmp2)
                        state.pc += next;
                    break;
                }
                case Instructions.SKIP_NEQ: {
                    const cmp1: any = state.pop();
                    const cmp2: any = state.pop();
                    if (cmp1 !== cmp2)
                        state.pc += next;
                    break;
                }
                case Instructions.REG:
                    state.regs[next] = state.pop();
                    break;
                case Instructions.TO_INT: {
                    const head: string = state.pop();
                    const parsed: number = parseInt(head, state.regs[0] || 10);
                    state.push(BigInt(parsed));
                    break;
                }
                case Instructions.TO_NUMBER: {
                    const head: string = state.pop();
                    const parsed: number = parseFloat(head);
                    state.push(parsed);
                    break;
                }
                case Instructions.TRUNCATE: {
                    const head: number = state.pop();
                    state.push(Math.trunc(head));
                    break;
                }
                case Instructions.TO_STRING: {
                    const head: string | Array<any> | Record<string, any> = state.pop();
                    if (Array.isArray(head) || typeof head === 'object')
                        state.push(JSON.stringify(head));
                    else
                        state.push(head.toString());
                    break;
                }
                case Instructions.DUP_HEAD: {
                    state.push(state.peek(-1));
                    break;
                }
                case Instructions.ASSERT: {
                    const head: any = state.pop();
                    const subHead: any = state.pop();
                    if (head !== subHead)
                        return state.abort(`Assertion failed: ${head} !== ${subHead}`);
                    break;
                }
                case Instructions.ABORT: {
                    console.log("ABORT OPCODE EXECUTING. TAPE STATES BEFORE ABORTING WILL BE PRINTED");
                    console.log("Userland", state.userland);
                    console.log("Stack", state.stack);
                    console.log("PROGRAM WILL NOW ABORT");
                    return state.abort(`program aborted normally with ${state.pop()}`);
                }
                case Instructions.LABEL: {
                    const initialPC: number = state.pc + 2;
                    //TODO introduce support for nested labels
                    const endPC: number = state.memory.findIndex((item, index) => index > initialPC && item === Instructions.END_LABEL);
                    if (endPC === -1)
                        return state.abort("Unclosed label");
                    state.labels[next] = [initialPC, endPC];
                    state.pc = endPC; //Skip the END_LABEL, the NOP and the IJMP altogether
                    state.memory[endPC] = Instructions.IJMP; //Replace LABEL_END with IJMP
                    break;
                }
                case Instructions.CALL: {
                    const labelName: string = next;
                    const spc: number = state.pc;
                    const [start, end]: [number, number] = state.labels[labelName];
                    state.pc = start - 2;//Substract 2 to account for the auto-increment
                    state.memory[end + 1] = spc; //Should be null memory now it is overwritten with the jump location (pc before the call)
                    break;
                }
                case Instructions.IJMP: {
                    state.pc = next;
                    break;
                }
                case Instructions.SWAP: {
                    const head: any = state.pop();
                    const prehead: any = state.pop();
                    state.push(head);
                    state.push(prehead);
                    break;
                }
                case Instructions.DBG: {
                    console.log("DBG:", state.stack);
                    break;
                }
                //CRYPTO
                case Instructions.SHA256: {
                    const head: string = state.pop();
                    state.push(createHash('sha256').update(head).digest(state.regs[0] === DIGEST_ENCODINGS.HEX ? 'hex' : 'base64'));
                    break;
                }
                case Instructions.SHA512: {
                    const head: string = state.pop();
                    state.push(createHash('sha512').update(head).digest(state.regs[0] === DIGEST_ENCODINGS.HEX ? 'hex' : 'base64'));
                    break;
                }
                //IO
                case Instructions.READ: {
                    READ.bind(state)();
                    break;
                }
                case Instructions.PUSH_APP: {
                    const head: Record<string, any> = state.pop();
                    state.apps.push(head);
                    break;
                }
                case Instructions.SET_STATE_VAR: {
                    const name: string = state.pop();
                    const value: string = state.pop();
                    state.stateChanges[name] = value;
                    break;
                }
                default:
                    return state.abort('[VM] unrecognized opcode! ' + Object.keys(Instructions).find(x => Instructions[x] === instruction));
            }
            state.pc += WideOpcodes.has(instruction) ? 2 : 1;
        }
        return {stack: state.stack, gas: state.usedGas, stateChanges: state.stateChanges, apps: state.apps};
    }
}


export const makeVm = (opts?: {log?: boolean, debug?: boolean})=>{
    const vm: Machine = {
        stack: [],
        regs: [],
        memory: [],
        userland: [], //Data storage
        apps: [],
        labels: {},
        map: {},
        stateChanges: {},
        stackMax: 128,
        usedGas: 0,
        ctx: {trigger_unit: undefined, this_address: undefined},
        pc: 0, // program counter

        push(val: any): void{
            if(this.stack.length >= this.stackMax)
                throw new Error('Stack overflow!');
            this.stack.push(val);
        },
        pop(): any{
            if(this.stack.length <= 0)
                throw new Error('Stack underflow!');
            return this.stack.pop();
        },
        peek(n: number = -1): any{
            if(this.stack.length < Math.abs(n))
                throw new Error('Peek underflow!');
            return this.stack.at(n);
        },
        debug(): void{
            //console.log("Evaluating", this.memory[this.pc]);
            //console.log("Stack", this.stack);
            //console.log("Memory", this.memory);
            //console.log("Labels", this.labels);
            //console.log("PC", this.pc);
        },
        abort(str): { stack: any; gas: any; stateChanges: any; apps: any, error?: string }{
            return {stack: this.stack, gas: this.usedGas, stateChanges: this.stateChanges, apps: this.apps, error: `[VM]${str.startsWith('[') ? str: ' '+str}`};
        },
        load(code: Array<any>): void{
            this.memory = code;
        }
    };
    const run = makeRun(vm, opts);
    const load: (code: Array<any>, ctx: InitialExecutionContext) => void = (code: Array<any>, ctx: InitialExecutionContext): void=>vm.load(code, ctx);
    return {load, run};
}