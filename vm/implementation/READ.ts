import {INTERRUPT_ARGUMENT, READ_ARGUMENT, READ_DATA_FEED_OPTIONS, REGISTERS} from "../types";

const POSSIBLE_ARGUMENTS: Set<number> = new Set(Object.keys(READ_ARGUMENT).filter(x=>typeof x === 'string').map((key: string): number => READ_ARGUMENT[key]));

//TODO move errors to ops.ts
export default function() { //Returns an interruption
    const what: READ_ARGUMENT = this.memory[this.pc+1];
    if (!POSSIBLE_ARGUMENTS.has(what))
        throw new Error("Tried to read an unknown DAG thing");

    //These can be handled by reading readonly registers set at start
    if (what === READ_ARGUMENT.THIS_ADDRESS)
        this.push(this.regs[REGISTERS.THIS_ADDRESS_REGISTRY]);

    else if (what === READ_ARGUMENT.TRIGGER)
        this.push(this.regs[REGISTERS.TRIGGER_REGISTRY]);

    //These will cause an interruption until the required data is provided
    else if (what === READ_ARGUMENT.BALANCE) {
        const address: string = this.regs[REGISTERS.ADDRESS_REGISTRY1];
        const asset: string = this.regs[REGISTERS.ASSET_REGISTRY];
        return {interruption: {type: INTERRUPT_ARGUMENT.BALANCE, payload: {address, asset}}};
    }

    else if (what === READ_ARGUMENT.VARIABLE){
        const address: string = this.regs[REGISTERS.ADDRESS_REGISTRY1];
        const varname: string = this.pop();
        return {interruption: {type: INTERRUPT_ARGUMENT.VARIABLE, payload: {address, varname}}};
    }

    else if (what === READ_ARGUMENT.ASSET){
        const asset: string = this.regs[REGISTERS.ASSET_REGISTRY];
        return {interruption: {type: INTERRUPT_ARGUMENT.ASSET, payload: {asset}}};
    }
    //READ DATA_FEED has 3 stack arguments [feed_name, mci, opts];
    else if (what === READ_ARGUMENT.DATA_FEED){
        const address: READ_ARGUMENT = this.regs[REGISTERS.ADDRESS_REGISTRY1];
        const opts: READ_DATA_FEED_OPTIONS = this.pop(); //MIN_MCI OR MAX_MCI
        if (opts !== READ_DATA_FEED_OPTIONS.MIN_MCI && opts !== READ_DATA_FEED_OPTIONS.MAX_MCI)
            throw new Error("Read data_feed options were not valid");
        const mci: number = this.pop();
        const feed_name: string = this.pop();
        if (typeof feed_name !== 'string')
            throw new Error("feed_name must be a string");
        if (typeof mci !== "number" || mci < 0)
            throw new Error("Tried to read a data_feed with a negative or non-number max_mci or min_mci");
        if (opts === READ_DATA_FEED_OPTIONS.MIN_MCI) {
            return {interruption: {type: INTERRUPT_ARGUMENT.DATA_FEED, payload: {address, feed_name, min_mci: mci}}};
            //this.push(readDataFeed(address, feed_name, mci));
        }
        else {
            return {interruption: {type: INTERRUPT_ARGUMENT.DATA_FEED, payload: {address, feed_name, max_mci: mci}}};
            //this.push(readDataFeed(address, feed_name, undefined, mci));
        }
    }
}