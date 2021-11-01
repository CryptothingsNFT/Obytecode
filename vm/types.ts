export type Opcode = { gas: number | (()=>number), code: number, wide?: boolean, assert?: ()=>void }
export enum REGISTERS {
    MODIFIER_REGISTRY,
    ADDRESS_REGISTRY1,
    ADDRESS_REGISTRY2,
    ASSET_REGISTRY,
    OPTS_REGISTRY,
    JUMP_REGISTRY,
    INPUT_REGISTRY,

    //READONLY
    TRIGGER_REGISTRY,
    THIS_ADDRESS_REGISTRY,
    MCI_REGISTRY,
}
export const READ_ONLY_REGISTERS: Set<number> = new Set([REGISTERS.TRIGGER_REGISTRY, REGISTERS.THIS_ADDRESS_REGISTRY]);
export const REGISTER_SET: Set<number> = new Set(Object.keys(REGISTERS).filter((x: string): boolean=> typeof x === "string").map((key: string): number => REGISTERS[key]));
export enum READ_DATA_FEED_OPTIONS {
    MIN_MCI,
    MAX_MCI
}
export enum READ_ARGUMENT {
    DATA_FEED,
    BALANCE,
    UNIT,
    TRIGGER,
    STACK,
    MAP,
    VARIABLE,
    THIS_ADDRESS,
    ASSET,
    MCI,
}
export enum INTERRUPT_ARGUMENT {
    DATA_FEED,
    BALANCE,
    UNIT,
    VARIABLE,
    ASSET
}
export const INTERRUPT_SET: Set<number> = new Set(Object.keys(REGISTERS).filter((x: string): boolean=> typeof x === "string").map((key: string): number => REGISTERS[key]));
export const enum APP_TYPE {
    PAYMENT,
    DATA,
    DATA_FEED
}
export const enum DIGEST_ENCODINGS {
    HEX,
    BASE64
}
export type VMInterface = {
    load: (code: Array<any>, ctx: InitialExecutionContext)=>void,
    write: (data: any)=>void,
    run: ()=>ExecutionOutput
}
export type Asset = {
    cap: number,
    exists: boolean
}

export type PAYLOAD_TYPE = Object;









export type ExecutionOutput = {
    stack: Array<any>,
    gas: number,
    stateChanges?: Record<string, string>,
    apps?: Array<Record<string, any>>,
    interruption?: {
        type: INTERRUPT_ARGUMENT,
        payload: Record<string, any>
    }
}
export type ExecutionOptions = {
    debug?: boolean,
    log?: boolean
}
export type InitialExecutionContext = {
    this_address: string,
    mci: number,
    trigger: {
        address: string,
        unit: string,
        initial_unit: string,
        data?: Record<string, string>
        output: Record<string, number>
        outputs: Record<string, number>
    }
}
export type Machine = {
    stack: Array<any>,
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
}