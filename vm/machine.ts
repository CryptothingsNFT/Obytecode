import {createHash} from "crypto";
import {Assertions, Gas, Instructions, WideOpcodes} from './ops';
import READ from "./implementation/READ";
import {DIGEST_ENCODINGS, REGISTERS} from "./types";
import type {ExecutionOptions, ExecutionOutput, InitialExecutionContext, Machine, VMInterface} from "./types";

//The returned function can be used to resume execution after an interruption
const makeRun: (state: Machine, opts?: ExecutionOptions)=>()=>ExecutionOutput = (state: Machine, opts?: ExecutionOptions)=>{
    let instruction: number = null;
    let next: any;
    let lhs: any, rhs: any; //Used for multiple opcodes
    return (): ExecutionOutput=>{
        if (state.regs[REGISTERS.INPUT_REGISTRY]) //We just woke up after an interrupt. Let's push the value that was just written to the input registry
            state.push(state.regs[REGISTERS.INPUT_REGISTRY]);
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
                case Instructions.JNE: {
                    rhs = state.pop();
                    lhs = state.pop();
                    if (lhs !== rhs)
                        state.pc = state.regs[REGISTERS.JUMP_REGISTRY];
                    else
                        state.pc++;
                    break;
                }
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
                case Instructions.EQUAL: {
                    rhs = state.pop();
                    lhs = state.pop();
                    state.push(lhs === rhs);
                    break;
                }
                case Instructions.NEQUAL: {
                    rhs = state.pop();
                    lhs = state.pop();
                    state.push(lhs !== rhs);
                    break;
                }
                case Instructions.GT: {
                    rhs = state.pop();
                    lhs = state.pop();
                    state.push(lhs > rhs);
                    break;
                }
                case Instructions.GTE: {
                    rhs = state.pop();
                    lhs = state.pop();
                    state.push(lhs >= rhs);
                    break;
                }
                case Instructions.LT: {
                    rhs = state.pop();
                    lhs = state.pop();
                    state.push(lhs < rhs);
                    break;
                }
                case Instructions.LTE: {
                    rhs = state.pop();
                    lhs = state.pop();
                    state.push(lhs <= rhs);
                    break;
                }
                case Instructions.IS_TRUTHY: {
                    const what: any = state.pop();
                    const isFalsy: boolean = what === undefined || what === null || what === 0 || what === false;
                    state.push(!isFalsy);
                    break;
                }
                case Instructions.PICK: {
                    const key: string = state.pop();
                    const object: Array<any> | Record<string, any> = state.pop();
                    state.push(object[key]);
                    break;
                }
                case Instructions.SET: {
                    const key: string = state.pop();
                    const value: any = state.pop();
                    state.map[key] = value;
                    break;
                }
                case Instructions.GET: {
                    const key:string = state.pop();
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
                    const parsed: number = parseInt(head, state.regs[REGISTERS.MODIFIER_REGISTRY] || 10);
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
                    const result = READ.bind(state)();
                    if (result) { //Needs interruption
                        state.pc+=2;
                        return result;
                    }
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

export const makeVm = (opts?: {log?: boolean, debug?: boolean}): VMInterface=>{
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
    };
    const run: () => ExecutionOutput = makeRun(vm, opts);
    const load: (code: Array<any>, ctx: InitialExecutionContext) => void = (code: Array<any>, ctx: InitialExecutionContext): void=>{
        vm.memory = code;
        //Set readonly registers
        vm.regs[REGISTERS.TRIGGER_REGISTRY] = ctx.trigger;
        vm.regs[REGISTERS.THIS_ADDRESS_REGISTRY] = ctx.this_address;
        vm.regs[REGISTERS.MCI_REGISTRY] = ctx.mci;
        vm.regs[REGISTERS.TIMESTAMP_REGISTRY] = ctx.timestamp;
        if (opts?.log || opts?.debug)
            console.log("Initial memory", JSON.stringify(vm.memory));
    };
    const write = (data: any)=>vm.regs[REGISTERS.INPUT_REGISTRY] = data;
    return {load, run, write};
}