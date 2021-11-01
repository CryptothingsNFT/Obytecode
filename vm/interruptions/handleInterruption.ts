import type {Asset} from "../types";
import {INTERRUPT_ARGUMENT} from "../types";
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

export default async ({type, payload}: {type: INTERRUPT_ARGUMENT, payload: Record<string, any>})=> {
    if (type === INTERRUPT_ARGUMENT.DATA_FEED)
        return readDataFeed();
    if (type === INTERRUPT_ARGUMENT.BALANCE)
        return readBalance(payload.address, payload.asset);
    if (type === INTERRUPT_ARGUMENT.ASSET)
        return readAsset(payload.asset);
    if (type === INTERRUPT_ARGUMENT.VARIABLE)
        return readVariable(payload.address, payload.varname);
}