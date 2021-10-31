import is_valid_address from "../validations/is_valid_address";
import {READ_ARGUMENT, READ_DATA_FEED_OPTIONS, REGISTERS} from "../types";
import {Instructions} from "../ops";

export default ({address, feed_name, min_mci = undefined, max_mci = undefined}: {address: string, feed_name: string, min_mci?: number, max_mci?: number}, name: string = "read_data_feed"): Array<number | string>=>{
    if (!is_valid_address(address))
        throw new Error("[routine][read_data_feed] Tried to read a data_feed from an invalid address");
    if (typeof feed_name !== "string")
        throw new Error("[routine][read_data_feed] Tried to read a data_feed with a non-string name");
    if (min_mci !== undefined && max_mci !== undefined)
        throw new Error("[routine][read_data_feed] Cannot use both min_mci and max_mci when reading a data_feed");
    let whichMCI: READ_DATA_FEED_OPTIONS;
    if (min_mci === undefined && max_mci === undefined)
        whichMCI = READ_DATA_FEED_OPTIONS.MIN_MCI;
    else if (min_mci !== undefined)
        whichMCI = READ_DATA_FEED_OPTIONS.MIN_MCI;
    else if (max_mci !== undefined)
        whichMCI = READ_DATA_FEED_OPTIONS.MAX_MCI;

    return [
        Instructions.LABEL, name,
        Instructions.IMM, address,
        Instructions.REG, REGISTERS.ADDRESS_REGISTRY1, //Set address_registry to the requested address
        //load parameters into the stack
        Instructions.IMM, feed_name,
        Instructions.IMM, min_mci ?? max_mci ?? 0,
        Instructions.IMM, whichMCI,

        Instructions.READ, READ_ARGUMENT.DATA_FEED, //Do the reading
        Instructions.END_LABEL,
        Instructions.NOP,
    ]
}
