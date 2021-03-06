import {Asset, READ_ARGUMENT, READ_DATA_FEED_OPTIONS, REGISTERS} from "../types";

const POSSIBLE_ARGUMENTS: Set<number> = new Set(Object.keys(READ_ARGUMENT).filter(x=>typeof x === 'string').map((key: string): number => READ_ARGUMENT[key]));
//TODO unstub
const readDataFeed = (): string=>"42";
//TODO unstub
const readBalance = (address: string, asset: string): number=>200;
//TODO unstub
const readAsset = (hash: string): Asset=>{
    return {
        exists: true,
        cap: 200
    }
}
//TODO unstub
const readVariable = (address: string, varname: string): string=>"BADAPPLE";
//TODO move errors to ops.ts
export default function() { //Returns an interruption
    const what: READ_ARGUMENT = this.memory[this.pc+1];
    if (!POSSIBLE_ARGUMENTS.has(what))
        throw new Error("Tried to read an unknown DAG thing");

    //These can be handled by reading readonly registers set at start
    if (what === READ_ARGUMENT.THIS_ADDRESS)
        return this.regs[REGISTERS.THIS_ADDRESS_REGISTRY];

    else if (what === READ_ARGUMENT.TRIGGER)
        return this.regs[REGISTERS.TRIGGER_REGISTRY];

    else if (what === READ_ARGUMENT.MCI)
        return this.regs[REGISTERS.MCI_REGISTRY];

    else if (what === READ_ARGUMENT.TIMESTAMP)
        return this.regs[REGISTERS.TIMESTAMP_REGISTRY];

    //These will cause an interruption until the required data is provided
    else if (what === READ_ARGUMENT.BALANCE) {
        const address: string = this.regs[REGISTERS.ADDRESS_REGISTRY1];
        const asset: string = this.regs[REGISTERS.ASSET_REGISTRY];
        return readBalance(address, asset);
    }

    else if (what === READ_ARGUMENT.VARIABLE){
        const address: string = this.regs[REGISTERS.ADDRESS_REGISTRY1];
        const varname: string = this.pop();
        return readVariable(address, varname);
    }

    else if (what === READ_ARGUMENT.ASSET){
        const asset: string = this.regs[REGISTERS.ASSET_REGISTRY];
        return readAsset(asset);
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
            return readDataFeed();
            //{interruption: {type: INTERRUPT_ARGUMENT.DATA_FEED, payload: {address, feed_name, min_mci: mci}}};
        }
        else {
            return readDataFeed();
        }
    }
}