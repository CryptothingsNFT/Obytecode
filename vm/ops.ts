import type {Opcode, PAYLOAD_TYPE} from "./types";
import is_valid_payload from "./validations/is_valid_payload";
import {READ_ARGUMENT, READ_ONLY_REGISTERS, REGISTER_SET, REGISTERS} from "./types";
import is_valid_address from "./validations/is_valid_address";

export const InstructionSet: Record<string, Opcode> = {
    NOP: {  //Should never be executed
        code: 0,
        assert(){
            return this.abort('[OPCODE NOP] stop right there!. There is a bug in your code!');
        },
        gas: 0
    },
    SUB: {  //If the stack ends with [..., 6, 9] It replaces them with 3
        gas: 1,
        code: 1
    },
    MUL: {  //If the stack ends with [..., 3, 2] It replaces them with 6
        gas: 1,
        code: 2
    },
    DIV: {  //If the stack ends with [..., 2, 4] It replaces them with 2
        gas: 1,
        code: 3
    },
    POW: {  //If the stack ends with [..., 10, 2] It replaces them with 100
        gas: 2,
        code: 4
    },
    EQUAL: {  //If the two items at the top of the stack are strictly equal then true is pushed into the stack. Otherwise false is pushed.
        gas: 1,
        code: 5
    },
    LIKE: { //TODO IMPLEMENT If the two items at the top of the stack are roughly equal (==) then true is pushed into the stack. Otherwise false is pushed.
        gas: 1,
        code: 6
    },
    NEQUAL: {   //TODO IMPLEMENT If the two items at the top of the stack are strictly not equal then true is pushed into the stack. Otherwise false is pushed.
        gas: 1,
        code: 7
    },
    NLIKE: {    //TODO IMPLEMENT If the two items at the top of the stack are roughly not equal (!=) then true is pushed into the stack. Otherwise false is pushed.
        gas: 1,
        code: 8
    },
    OR: {   //TODO IMPLEMENT If the stack ends with [..., item1, item2] both items are removed from the stack and the result of (item1 || item2) is pushed.
        gas: 1,
        code: 9
    },
    AND: {  //TODO IMPLEMENT If the stack ends with [..., item1, item2] both items are removed from the stack and the result of (item1 && item2) is pushed.
        gas: 1,
        code: 10
    },
    XOR: {
        gas: 2,
        code: 11
    },
    LT: {
        gas: 1,
        code: 12
    },
    LTE: {
        gas: 1,
        code: 13
    },
    GT: {
        gas: 1,
        code: 14
    },
    GTE: {
        gas: 1,
        code: 15
    },
    UNREG: { //reads register data into the stack
        gas: 1,
        code: 16,
        wide: true //Which register to read
    },
    EXIT: { //Programs finished cleanly
        gas: 1,
        code: 17
    },
    LABEL: {    //Creates a label that to jump to in the future
        gas: 1,
        code: 18,
        wide: true
    },
    END_LABEL: { //The previously opened label is closed here
        gas: 1,
        assert(){
            if (this.memory[this.pc+1] !== 0)
                return this.abort(`[OPCODE END_LABEL] there must be a NOP after the opcode`);
        },
        code: 19,
        wide: true //Has a NOP after the closing label to store the location to jump after the label is executed
    },
    CALL: { //Moves PC to a label
        gas: 1,
        code: 20,
        wide: true //Contains the label to jump to
    },
    TRUNC: { //Truncates a number to an integer or an array to the given length
        gas: 2,
        assert(){
            const length: number = this.peek(-1);
            if (typeof length !== 'number')
                return this.abort(`[OPCODE TRUNC] the head is not of type number. It is ${typeof length}`);
            const arg: number | Array<any> = this.peek(-2);
            if (typeof arg !== 'number' && !Array.isArray(arg))
                return this.abort(`[OPCODE TRUNC] the subhead is not of type number nor array. It is ${typeof arg}`);
        },
        code: 21
    },
    DUP_HEAD: { //Duplicates the head of the stack
        gas: 1,
        assert(){
            if (this.stack.length === 0)
                return this.abort('[OPCODE DUP_HEAD] the stack is empty');
        },
        code: 22
    },
    REG: {  //Moves the head of the stack into a registry
        gas: 1,
        code: 23,
        assert(){
            const registry: REGISTERS = this.memory[this.pc+1];
            const head = this.peek(-1);
            if (READ_ONLY_REGISTERS.has(registry))
                return this.abort("[OPCODE REG] tried to write on a readonly register");
            if (!REGISTER_SET.has(registry))
                return this.abort(`[OPCODE REG] tried to write to a nonexistent registry: ${this.memory[this.pc+1]}`);
            if ((registry === REGISTERS.ADDRESS_REGISTRY1 || registry === REGISTERS.ADDRESS_REGISTRY2) && !is_valid_address(head))
                return this.abort(`[OPCODE REG] tried to set an address registry to an invalid address ${head}`);
            if (registry === REGISTERS.JUMP_REGISTRY && typeof head !== 'number')
                return this.abort(`[OPCODE REG] tried to set a jump registry to a non number value ${head}`);
        },
        wide: true //Which register to set. The value stored in the register is popped from the stack
    },
    JEQ: { //Jump to the address stored in the jump registry if the two items at the top of the stack are equal
        gas: 2,
        code: 24
    },
    JNE: {  //Jump to the address stored in the jump registry if the two items at the top of the stack are NOT equal
        gas: 2,
        code: 25
    },
    IS_FALSY: { //Pushes true to the stack if the head is falsy and false otherwise
        code: 26,
        gas: 1,
    },
    IMM: {  //Pushes data into the stack
        gas: 1,
        code: 27,
        wide: true //What to push into the stack
    },
    ADD: {  //Add the two elements at the top of the stack (concats strings)
        code: 28,
        assert(){
            if (this.stack.length < 2)
                return this.abort('[OPCODE AA] the stack has less than 2 elements');
            const operand1 = this.peek(-1);
            const operand2 = this.peek(-2);
            if (typeof operand1 !== 'string' && typeof operand2 !== 'string') { //If one of them is a string any concatenation is valid
                if (typeof operand1 !== 'number' && typeof operand1 !== 'bigint')
                    return this.abort(`[OPCODE ADD] the head must be of type number, bigint or string. It is ${typeof operand1}`);
                if (typeof operand2 !== 'number' && typeof operand2 !== 'bigint')
                    return this.abort(`[OPCODE ADD] the subhead must be of type number, bigint or string. It is ${typeof operand2}`);
            }
        },
        gas: 1
    },
    LOAD: { //Loads data from the userland memory into the stack
        code: 29,
        gas: 1,
        wide: true, //Position to read from the memory into the stack
        assert(){
            if (this.userland[this.memory[this.pc+1]] === undefined)
                throw new Error(`[OPCODE LOAD] attempted to load an nonexistent memory value: [${this.userland}][${this.pc+1}]`);
        }
    },
    IS_TRUTHY: { //Pushes true to the stack if the head is truthy and false otherwise
        code: 30,
        gas: 1,
    },
    IJMP: { //Sets the PC
        gas: 1,
        code: 31,
        wide: true  //Address to jump to
    },
//CONVERSIONS
    TO_INT: {   //The head is converted into a BigInt
        code: 32,
        gas: 2,
        assert(){
            const head = this.peek(-1);
            if (typeof head !== 'string' && typeof head !== 'number')
                return this.abort("[OPCODE TO_INT]: head must be a string or a number");
        }
    },
    TO_NUMBER: {    //The head is converted to a number (not bigint)
        code: 33,
        gas: 2,
        assert(){
            const head = this.peek(-1);
            if (typeof head !== 'string' && typeof head !== 'bigint')
                return this.abort("[OPCODE TO_NUMBER]: head must be a string or a number");
        }
    },
    TO_STRING: {    //The head is converted to a string
        code: 34,
        gas: 4
    },
    SWAP: { //The two items at the top of the stack are swapped
        code: 35,
        gas: 2
    },
    ABORT: { //Aborts program execution. The head is used as the error reason.
        code: 36,
        gas: 0
    },
    INC: { //Increments a register
        code: 37,
        gas: 1,
        wide: true
    },
    VAR: {  //pops head into a variable
        code: 38,
        gas: 3,
        wide: true //var name
    },
    MEM: {//Stores head in userland memory
        code: 39,
        gas: 1,
        wide: true //Position in memory
    },
    SKIP_EQ: { //Moves the PC back or forth
        code: 40,
        gas: 1,
        wide: true //How many places to jump
    },
    SKIP_NEQ: {//Moves the PC back or forth
        code: 41,
        gas: 1,
        wide: true //How many places to jump
    },
    POP_HEAD: {//Deletes the current head
        code: 42,
        assert(){
            if (this.stack.length === 0)
                return this.abort("[OPCODE POP_HEAD] the stack is empty");
        },
        gas: 1
    },
    PICK: { //Pushes object[key] into the stack. The STACK must end with [..., object, key]
        code: 43,
        assert(){
            const key = this.peek(-1);
            const object = this.peek(-2);
            if (typeof object !== 'object')
                return this.abort(`[OPCODE PICK] target should be object or array`);
            if (typeof key !== 'number' && typeof key !== 'string')
                return this.abort(`[OPCODE PICK] key should be string or number`);
        },
        gas: 1
    },
    DEF: { //Defines a property in an object. The stack must end with [..., object, key, value]. The object is not popped from the stack.
        code: 44,
        assert(){
            const key = this.peek(-2);
            const object = this.peek(-3);
            if (typeof object !== 'object')
                return this.abort(`[OPCODE DEF] target should be object or array`);
            if (typeof key !== 'number' && typeof key !== 'string')
                return this.abort(`[OPCODE DEF] key should be string or number`);
        },
        gas: 1
    },
    LENGTH: { //Pushes the length of the array or string into the stack
        code: 45,
        assert(){
            const argument: Array<any> | string = this.peek(-1);
            if (typeof argument !== 'string' && !Array.isArray(argument))
                return this.abort("[OPCODE LENGTH] the head is not an array nor a string");
        },
        gas: 1
    },
    SKIP: { //Unconditionally shifts the PC
        code: 46,
        gas: 1,
        wide: true
    },
    MAP: {
        code: 47,
        gas: 0, //Gas is calculated when the nested VM exits
        wide: true //Callback
    },
    DBG: {
        code: 1337,
        gas: 0
    },
//CRYPTO
    SHA256: {
        code: 64,
        assert(){
            const head = this.peek(-1);
            if (typeof head !== 'string')
                return this.abort(`[OPCODE SHA256] head must be of type string. It is ${typeof head}`);
        },
        gas: 15
    },
    SHA512: {
        code: 65,
        assert(){
            const head = this.peek(-1);
            if (typeof head !== 'string')
                return this.abort(`[OPCODE SHA256] head must be of type string. It is ${typeof head}`);
        },
        gas: 16
    },
//IO
    READ: { //Read data from the DAG. See READ_ARGUMENT type to check what can be read.
        gas(){
            return this.memory[this.pc+1] === READ_ARGUMENT.TRIGGER ? 1 : 1000;
        },
        assert(){
            const argument: number = this.memory[this.pc+1];
            if (READ_ARGUMENT[argument] === undefined)
                return this.abort(`[OPCODE READ] head must be a valid READ_ARGUMENT. It is ${argument}`);
        },
        wide: true, //READ_ARGUMENT
        code: 100
    },
    PUSH_APP: { //Pushes an app to the app stack
        gas(){
            const payload: PAYLOAD_TYPE = this.peek(-1);
            return 1000 + JSON.stringify(payload).length;
        },
        assert(){
            if (!is_valid_payload(this.stack.peek(-1)))
                return this.abort("[OPCODE PUSH_APP] assertion failed. The payload in the stack is not valid");
        },
        code: 101
    },
    SET_STATE_VAR: {    //Sets a state var. The stack must end with [..., value, key]
        gas(){
            const key: string = this.peek(-1);
            const value: string = this.peek(-2);
            return key.length+value.toString().length+100;
        },
        assert(){
            if (this.stack.length < 2)
                return this.abort(`[OPCODE SET_STATE_VAR] the stack has fewer than 2 items: ${JSON.stringify(this.stack)}`);
            const key: string = this.peek(-1);
            const value: string = this.peek(-2);
            if (typeof key !== "string")
                return this.abort(`[OPCODE SET_STATE_VAR] the key is not a string: ${JSON.stringify(this.stack)}`);
            if (typeof value !== "string")
                return this.abort(`[OPCODE SET_STATE_VAR] the value is not a string: ${JSON.stringify(this.stack)}`);
        },
        code: 102
    },
//MAP - Users have access to a map-like data structure within their program
    SET: {  //Sets a key in the map. The stack must end with [..., value, key]
        gas: 1,
        code: 103
    },
    GET: {  //Reads a key from the stack. The stack must hold the key you want to read.
        gas: 1,
        code: 104
    },
    UNSET: { //Deletes a key from the map. The map must hold the key you want to delete.
        gas: 1,
        code: 105
    },
}
export const Instructions: Record<string, number> = Object.entries(InstructionSet).reduce((acc: Record<string, number>, [k, v]: [string, Opcode]): Record<string, number>=>{acc[k] = v.code; return acc}, {});
export const WideOpcodes: Set<number> = new Set(Object.values(InstructionSet).filter((x: Opcode): boolean=>x.wide).map((x: Opcode): number=>x.code)); // Opcodes requiring an immediate / address value in the adjacent byte(s)
export const Gas: Record<number, number | Function> = Object.values(InstructionSet).reduce((acc: Record<number, number | Function>, v: Opcode): Record<number, number | Function>=>{acc[v.code] = v.gas; return acc}, {});
export const Assertions: Record<number, ()=>void> = Object.values(InstructionSet).reduce((acc: Record<number, ()=>void>, v: Opcode): Record<number, ()=>void>=>{
    if (v.assert)
        acc[v.code] = v.assert;
    return acc
}, {});