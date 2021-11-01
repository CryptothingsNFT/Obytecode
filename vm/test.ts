import Routines from "./routines";
import {Instructions} from "./ops";
import {makeVm} from "./machine";
import {run as hostRun} from "./host";
import type {VMInterface} from "./types";

const vm: VMInterface = makeVm({log: true});

vm.load([
    //this imports a routine called read_data_feed. Importing supports renaming the imported function by passing a second argument
    ...Routines.READ_DATA_FEED({address: "RO7ZAGVJPBOZFH4NMDGZGY4IRILNNEUQ", feed_name: "GBYTE_USD", max_mci: 1000}),
    //Call read_data_feed routine
    Instructions.CALL, 'read_data_feed',
    //cast to integer type (native BigInt)
    Instructions.TO_INT,
    //push 12 to the stack
    Instructions.IMM, 12n,
    //ADD data_feed value + 12
    Instructions.ADD,
    //Convert to string
    Instructions.TO_STRING,
    //push "result to the stack"
    Instructions.IMM, "result",
    //update or create a state var called result with data_feed value + 12. At the end of the execution a stateChanges hashMap is returned with all the state changes
    Instructions.SET_STATE_VAR
], {this_address: "MY_ADDRESS", mci: 1, trigger: {unit: "TRIGGER_UNIT", initial_unit: "TRIGGER_UNIT", address: "TRIGGER_ADDRESS", output: {base: 3000}, outputs: {base: 3000}}});

console.log(await hostRun(vm));
//Logs { stack: [], gas: 1125, stateChanges: { result: '42' }, apps: [] }