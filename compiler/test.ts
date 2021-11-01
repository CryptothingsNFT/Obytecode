import parse from "./toAST";
import toBytecode from "./toBytecode";
import {makeVm} from "../vm/machine";

const initSection: string = `init: "{
        $foo = 77;
        $bar = $foo;
        $baz = $bar * $foo;
        $biz = $baz - 100 + 7;
        $ret = "abn" || "abn";
        $false = false;
        $a = $false OTHERWISE $ret;
        \${'name' || 3} = $ret || 10;
        $nameLast = \${'name' || 3} || \${'name' || 3};
        bounce($nameLast || this_address || asset['asset'].exists);
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

try{
    const parsed: [string, {init?: Array<any>, messages?: Array<any>, getters?: Array<any>, bounce_fees?: Array<any>}] = parse(code) as [string, {init?: Array<any>, messages?: Array<any>, getters?: Array<any>, bounce_fees?: Array<any>}];
    const {bounce_fees, init, messages, getters} = parsed[1];
    const initBytecode: Array<any> = toBytecode(init);
    const {load, run} = makeVm();
    load(initBytecode, {trigger_unit: "TRIGGER_UNIT", this_address: "THIS_ADDRESS"});
    const strippedInit: string = `{${initSection.replaceAll(' ', '').replaceAll('\t', '').replaceAll('\n', '')}}`;
    console.log("Oscript", strippedInit, strippedInit.length);
    console.log('Tape length', initBytecode.length);

    console.log("BEGIN EXECUTION:");
    console.log(run());
    console.log("EXECUTION ENDED");
} catch (e){
    console.error(e);
}