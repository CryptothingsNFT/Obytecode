import {createHash} from "crypto";
import {Assertions, Gas, Instructions, WideOpcodes} from './ops';
import READ from "./implementation/READ";
import {REGISTERS} from "./types";

export const VM = {
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
    ctx: {},
    pc: 0, // program counter

    reset(): void{
        this.stack = [];
        this.regs = [];
        this.memory = [];
        this.userland = [];
        this.apps = [];
        this.labels = {};
        this.map = {};
        this.stateChanges = {};
        this.stackMax = 128;
        this.usedGas = 0;
        this.pc = 0;
    },

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
    interpret(ctx, opts?: {debug?: boolean, log?: boolean}): { stack: any; gas: any; stateChanges: any; apps: any, error?: string }{
        let instruction: number = null;
        let next: any;
        let lhs: any, rhs: any; //Used for multiple opcodes
        this.regs[REGISTERS.TRIGGER_REGISTRY] = ctx.trigger_unit;
        this.regs[REGISTERS.THIS_ADDRESS_REGISTRY] = ctx.this_address;
        if (opts?.log || opts?.debug)
            console.log("Initial memory", this.memory);

        while(instruction !== Instructions.NOP && this.pc < this.memory.length){
            instruction = this.memory[this.pc];
            if (opts?.log)
                console.log("Evaluating", Object.keys(Instructions).find(x=>Instructions[x] === instruction), WideOpcodes.has(instruction) ? next : undefined);
            if (Assertions[instruction]) {
                const errored = Assertions[instruction].bind(this)();
                if (errored)
                    return errored;
            }
            this.usedGas += (typeof Gas[instruction] === 'number') ? Gas[instruction] : (Gas[instruction] as ()=>number).bind(this)();

            if(this.pc+1 < this.memory.length) // only read an entire word if there's a word's worth of address space left
                next = this.memory[this.pc + 1];
            else
                next = null;
            if (opts?.debug)
                this.debug();

            // check for well-formed instructions
            if (WideOpcodes.has(instruction) && next === null)
                return this.abort('Expected immediate / address!');

            // execute instructions
            switch(instruction){
                case Instructions.END_LABEL:
                    break;
                case Instructions.NOP:
                    break;
                case Instructions.IMM: {
                    this.push(next);
                    break;
                }
                case Instructions.ADD:
                    rhs = this.pop();
                    lhs = this.pop();
                    this.push(lhs + rhs);
                    break;
                case Instructions.SUB:
                    rhs = this.pop();
                    lhs = this.pop();
                    this.push(lhs - rhs);
                    break;
                case Instructions.MUL:
                    rhs = this.pop();
                    lhs = this.pop();
                    this.push(lhs * rhs);
                    break;
                case Instructions.DIV:
                    rhs = this.pop();
                    lhs = this.pop();
                    this.push(lhs/rhs | 0); // integer division, rounds towards 0 (unlike Math.floor)
                    break;
                case Instructions.JEQ:
                    rhs = this.pop();
                    lhs = this.pop();
                    if(lhs === rhs)
                        this.pc = this.regs[REGISTERS.JUMP_REGISTRY];
                    else
                        this.pc++;
                    break;
                case Instructions.JNE:
                    rhs = this.pop();
                    lhs = this.pop();
                    if(lhs !== rhs)
                        this.pc = this.regs[REGISTERS.JUMP_REGISTRY];
                    else
                        this.pc++;
                    break;
                case Instructions.LOAD:
                    this.push(this.userland[next]);
                    break;
                case Instructions.MEM: {
                    this.userland[next] = this.pop();
                    break;
                }
                case Instructions.POP_HEAD:
                    this.pop();
                    break;
                case Instructions.IS_TRUTHY:
                    const what = this.pop();
                    const isFalsy: boolean = what === undefined || what === null || what === 0 || what === false;
                    this.push(!isFalsy);
                    break;

                case Instructions.PICK: {
                    const key: string = this.pop();
                    const object: Array<any> | Record<string, any> = this.pop();
                    this.push(object[key]);
                    break;
                }
                case Instructions.SET: {
                    const key = this.pop();
                    const value = this.pop();
                    this.map[key] = value;
                    break;
                }
                case Instructions.GET: {
                    const key = this.pop();
                    this.push(this.map[key]);
                    break;
                }
                case Instructions.SKIP_EQ: {
                    const cmp1 = this.pop();
                    const cmp2 = this.pop();
                    if (cmp1 === cmp2)
                        this.pc += next;
                    break;
                }
                case Instructions.SKIP_NEQ: {
                    const cmp1 = this.pop();
                    const cmp2 = this.pop();
                    if (cmp1 !== cmp2)
                        this.pc += next;
                    break;
                }
                case Instructions.REG:
                    this.regs[next] = this.pop();
                    break;
                case Instructions.TO_INT: {
                    const head: string = this.pop();
                    const parsed: number = parseInt(head, this.regs[0] || 10);
                    this.push(BigInt(parsed));
                    break;
                }
                case Instructions.TO_NUMBER: {
                    const head: string = this.pop();
                    const parsed: number = parseFloat(head);
                    this.push(parsed);
                    break;
                }
                case Instructions.TRUNCATE: {
                    const head: number = this.pop();
                    this.push(Math.trunc(head));
                    break;
                }
                case Instructions.TO_STRING: {
                    const head: string | Array<any> | Record<string, any> = this.pop();
                    if (Array.isArray(head) || typeof head === 'object')
                        this.push(JSON.stringify(head));
                    else
                        this.push(head.toString());
                    break;
                }
                case Instructions.DUP_HEAD: {
                    this.push(this.peek(-1));
                    break;
                }
                case Instructions.ASSERT: {
                    const head = this.pop();
                    const subHead = this.pop();
                    if (head !== subHead)
                        return this.abort(`Assertion failed: ${head} !== ${subHead}`);
                    break;
                }
                case Instructions.ABORT: {
                    console.log("ABORT OPCODE EXECUTING. TAPE STATES BEFORE ABORTING WILL BE PRINTED");
                    console.log("Userland", this.userland);
                    console.log("Stack", this.stack);
                    console.log("PROGRAM WILL NOW ABORT");
                    return this.abort(`program aborted normally with ${this.pop()}`);
                }
                case Instructions.LABEL: {
                    const initialPC: number = this.pc+2;
                    //TODO introduce support for nested labels
                    const endPC: number = this.memory.findIndex((item, index) => index > initialPC && item === Instructions.END_LABEL);
                    if (endPC === -1)
                        return this.abort("Unclosed label");
                    this.labels[next] = [initialPC, endPC];
                    this.pc = endPC; //Skip the END_LABEL, the NOP and the IJMP altogether
                    this.memory[endPC] = Instructions.IJMP; //Replace LABEL_END with IJMP
                    break;
                }
                case Instructions.CALL: {
                    const labelName: string = next;
                    const spc: number = this.pc;
                    const [start, end]: [number, number] = this.labels[labelName];
                    this.pc = start-2;//Substract 2 to account for the auto-increment
                    this.memory[end+1] = spc; //Should be null memory now it is overwritten with the jump location (pc before the call)
                    break;
                }
                case Instructions.IJMP: {
                    this.pc = next;
                    break;
                }
                case Instructions.SWAP: {
                    const head: any = this.pop();
                    const prehead: any = this.pop();
                    this.push(head);
                    this.push(prehead);
                    break;
                }
                case Instructions.DBG: {
                    console.log("DBG:", this.stack);
                    break;
                }
                //CRYPTO
                case Instructions.SHA256: {
                    const head: string = this.pop();
                    this.push(createHash('sha256').update(head).digest(this.regs[0] === 0 ? 'hex' : 'base64'));
                    break;
                }
                case Instructions.SHA512: {
                    const head: string = this.pop();
                    this.push(createHash('sha512').update(head).digest(this.regs[0] === 0 ? 'hex' : 'base64'));
                    break;
                }
                //IO
                case Instructions.READ: {
                    READ.bind(this)();
                    break;
                }
                case Instructions.PUSH_APP:
                    this.apps.push(this.pop);
                    break;
                case Instructions.SET_STATE_VAR: {
                    const name: string = this.pop();
                    const value: string = this.pop();
                    this.stateChanges[name] = value;
                    break;
                }
                default:
                    return this.abort('[VM] unrecognized opcode! ' + Object.keys(Instructions).find(x=>Instructions[x] === instruction));
            }
            this.pc += WideOpcodes.has(instruction) ? 2 : 1;
        }
        return {stack: this.stack, gas: this.usedGas, stateChanges: this.stateChanges, apps: this.apps};
    },
    load(code: Array<any>): void{
        this.memory = code;
    }
};