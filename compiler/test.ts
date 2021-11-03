import parse from "./toAST";
import toBytecode from "./toBytecode";
import {makeVm} from "../vm/machine";
import {run as hostRun} from "../vm/host";
import type {VMInterface} from "../vm/types";

const initSection: string = `init: "{
        $arr = ["a", "b"];
        $arr1 = map($arr, 2, ($x, $i) => $x || $i || $i);
        bounce($arr1);
    }"`;

const code: string = `{
\t\tbounce_fees: { base: 10000 },
    getters: "{
        $get = ()=>{
            $a = 100;
            return $a;
        };
    }",
\t\t${initSection},
\t\tmessages: {
\t\t\tcases: [
\t\t\t\t{
\t\t\t\t\tif: "{trigger.data.x}",
\t\t\t\t\tmessages: [
\t\t\t\t\t\t{
\t\t\t\t\t\t\tapp: 'payment',
\t\t\t\t\t\t\tpayload: {
\t\t\t\t\t\t\t\tasset: 'base',
\t\t\t\t\t\t\t\toutputs: [
\t\t\t\t\t\t\t\t\t{address: "{trigger.address}", amount: "{trigger.output[[asset=base]] - 500}"}
\t\t\t\t\t\t\t\t]
\t\t\t\t\t\t\t}
\t\t\t\t\t\t}
\t\t\t\t\t]
\t\t\t\t},
\t\t\t\t{
\t\t\t\t\tif: "{trigger.data.y}",
\t\t\t\t\tinit: "{$c = trigger.data.y;}",
\t\t\t\t\tmessages: [
\t\t\t\t\t\t{
\t\t\t\t\t\t\tapp: 'payment',
\t\t\t\t\t\t\tpayload: {
\t\t\t\t\t\t\t\tasset: 'base',
\t\t\t\t\t\t\t\toutputs: [
\t\t\t\t\t\t\t\t\t{address: "{trigger.address}", amount: "{trigger.output[[asset=base]] - 500 - $c}"}
\t\t\t\t\t\t\t\t]
\t\t\t\t\t\t\t}
\t\t\t\t\t\t}
\t\t\t\t\t]
\t\t\t\t},
\t\t\t]
\t\t}
\t}`


const parsed: [string, {init?: Array<any>, messages?: Array<any>, getters?: Array<any>, bounce_fees?: Array<any>}] = parse(code) as [string, {init?: Array<any>, messages?: Array<any>, getters?: Array<any>, bounce_fees?: Array<any>}];
const {bounce_fees, init, messages, getters} = parsed[1];
const initBytecode: Array<any> = toBytecode(init);
const vm: VMInterface = makeVm({debug: true, log: true});





vm.load(initBytecode, {this_address: "RO7ZAGVJPBOZFH4NMDGZGY4IRILNNEUQ", mci: 1, timestamp: Math.trunc(Date.now() / 1000), trigger: {unit: "TRIGGER_UNIT", initial_unit: "TRIGGER_UNIT", address: 'TRIGGER_ADDRESS', output: {base: 3000}, outputs: {base: 3000}}});
const strippedInit: string = `{${initSection.replaceAll(' ', '').replaceAll('\t', '').replaceAll('\n', '')}}`;
console.log("Oscript", strippedInit, strippedInit.length);
console.log('Tape length', initBytecode.length);

console.log("BEGIN EXECUTION:");
console.log(await hostRun(vm));
console.log("EXECUTION ENDED");