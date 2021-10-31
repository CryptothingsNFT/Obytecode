export type Opcode = { gas: number | (()=>number), code: number, wide?: boolean, assert?: ()=>void }
export enum REGISTERS {
    MODIFIER_REGISTRY,
    ADDRESS_REGISTRY1,
    ADDRESS_REGISTRY2,
    ASSET_REGISTRY,
    OPTS_REGISTRY,
    JUMP_REGISTRY,


    //READONLY
    TRIGGER_REGISTRY,
    THIS_ADDRESS_REGISTRY
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
    ASSET
}
export const enum APP_TYPE {
    PAYMENT,
    DATA,
    DATA_FEED
}
export const enum DIGEST_ENCODINGS {
    HEX,
    BASE64
}


export type PAYLOAD_TYPE = Object;