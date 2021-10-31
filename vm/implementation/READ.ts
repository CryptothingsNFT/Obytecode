import {READ_ARGUMENT, READ_DATA_FEED_OPTIONS, REGISTERS} from "../types";

const POSSIBLE_ARGUMENTS: Set<number> = new Set(Object.keys(READ_ARGUMENT).filter(x=>typeof x === 'string').map((key: string): number => READ_ARGUMENT[key]));

//TODO unstub
const DATA_FEEDS = {
    "RO7ZAGVJPBOZFH4NMDGZGY4IRILNNEUQ": {
        GBYTE_USD: {
            1000: "30", //MCI => value
            1003: "32",
            1005: "33",
        }
    }
}

//TODO unstub
const readDataFeed = (address, feed_name, min_mci, max_mci = undefined)=>{
    if (min_mci === 0)
        return Object.entries(DATA_FEEDS[address][feed_name]).at(0)?.[1];
    if (max_mci === 0)
        return Object.entries(DATA_FEEDS[address][feed_name]).reverse().at(0)?.[1];
    if (min_mci)
        return Object.entries(DATA_FEEDS[address][feed_name]).find(([mci, _])=>mci >= min_mci)?.[1];
    if (max_mci)
        return Object.entries(DATA_FEEDS[address][feed_name]).reverse().find(([mci, _])=>mci <= max_mci)?.[1];
}

//TODO unstub
const readBalance = (address: string, asset: string): number=>{
    return 200;
}

//TODO unstub
const readAsset = (hash: string)=>{
    return {
        exists: true,
        cap: 200
    }
}

const readVariable = (address: string, varname: string): any=>{
    return "BADAPPLE";
}

//TODO move errors to ops.ts
export default function() {
    const what: READ_ARGUMENT = this.memory[this.pc+1];
    if (!POSSIBLE_ARGUMENTS.has(what))
        throw new Error("Tried to read an unknown DAG thing");

    if (what === READ_ARGUMENT.THIS_ADDRESS)
        this.push(this.regs[REGISTERS.THIS_ADDRESS_REGISTRY]);

    else if (what === READ_ARGUMENT.TRIGGER)
        this.push(this.regs[REGISTERS.TRIGGER_REGISTRY]);

    else if (what === READ_ARGUMENT.BALANCE) {
        const address: string = this.regs[REGISTERS.ADDRESS_REGISTRY1];
        const asset: string = this.regs[REGISTERS.ASSET_REGISTRY];
        this.push(readBalance(address, asset));
    }

    else if (what === READ_ARGUMENT.VARIABLE){
        const address: string = this.regs[REGISTERS.ADDRESS_REGISTRY1];
        const varname: string = this.pop();
        this.push(readVariable(address, varname));
    }

    else if (what === READ_ARGUMENT.ASSET){
        const hash: string = this.regs[REGISTERS.ADDRESS_REGISTRY1];
        this.push(readAsset(hash));
    }
    //READ DATA_FEED has 3 stack arguments [feed_name, mci, opts];
    else if (what === READ_ARGUMENT.DATA_FEED){
        const address: READ_ARGUMENT = this.regs[REGISTERS.ADDRESS_REGISTRY1];
        const opts: READ_DATA_FEED_OPTIONS = this.pop(); //MIN_MCI OR MAX_MCI
        if (opts !== READ_DATA_FEED_OPTIONS.MIN_MCI && opts !== READ_DATA_FEED_OPTIONS.MAX_MCI)
            throw new Error("Read data_feed options were not valid");
        const mci: number = this.pop();
        const feed_name: string = this.pop();
        console.log("Reading data feed", address, feed_name, mci);
        if (typeof feed_name !== 'string')
            throw new Error("feed_name must be a string");
        if (typeof mci !== "number" || mci < 0)
            throw new Error("Tried to read a data_feed with a negative or non-number max_mci or min_mci");
        if (opts === READ_DATA_FEED_OPTIONS.MIN_MCI)
            this.push(readDataFeed(address, feed_name, mci));
        else
            this.push(readDataFeed(address, feed_name, undefined, mci));
    }
}